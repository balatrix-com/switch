"""Small FreeSWITCH Event Socket client used for live-call polling."""

from __future__ import annotations

import json
import re
import socket
import time
from threading import Lock
from typing import Any


class EslClient:
    def __init__(self, host: str, port: int, password: str, cache_seconds: float = 2.0):
        self.host = host
        self.port = port
        self.password = password
        self.cache_seconds = cache_seconds
        self._lock = Lock()
        self._cached: tuple[dict[str, Any], float] | None = None
        self._business_directions: dict[str, str] = {}
        self._direction_retry: dict[str, tuple[int, float]] = {}

    def live_calls(self) -> dict[str, Any]:
        with self._lock:
            if self._cached and self._cached[1] > time.monotonic():
                return self._cached[0]
            calls = self._rows("show calls as json")
            channels = self._rows("show channels as json")
            result = self._summarize(calls, channels)
            active_uuids = {call["uuid"] for call in result["calls"]}
            self._business_directions = {
                uuid: direction for uuid, direction in self._business_directions.items()
                if uuid in active_uuids
            }
            self._direction_retry = {
                uuid: retry for uuid, retry in self._direction_retry.items()
                if uuid in active_uuids
            }
            probe_time = time.monotonic()
            pending = [
                call["uuid"] for call in result["calls"]
                if call["direction"] not in ("inbound", "outbound")
                and call["uuid"] not in self._business_directions
                and self._direction_retry.get(call["uuid"], (0, 0))[1] <= probe_time
            ]
            if pending:
                try:
                    replies = self._api_batch([
                        f"uuid_getvar {uuid} billing_direction" for uuid in pending
                    ])
                except (ConnectionError, OSError, RuntimeError):
                    replies = []
                for uuid, reply in zip(pending, replies):
                    direction = reply.strip().lower()
                    if direction in ("inbound", "outbound"):
                        self._business_directions[uuid] = direction
                        self._direction_retry.pop(uuid, None)
                    else:
                        attempts = self._direction_retry.get(uuid, (0, 0))[0] + 1
                        self._direction_retry[uuid] = (
                            attempts, probe_time + min(2 ** attempts, 30)
                        )
            for call in result["calls"]:
                uuid = call["uuid"]
                direction = call["direction"] if call["direction"] in ("inbound", "outbound") else self._business_directions.get(uuid, "unknown")
                if direction in ("inbound", "outbound"):
                    self._business_directions[uuid] = direction
                    call["direction"] = direction
            directions = [call["direction"] for call in result["calls"]]
            result["summary"]["inbound"] = directions.count("inbound")
            result["summary"]["outbound"] = directions.count("outbound")
            self._cached = (result, time.monotonic() + self.cache_seconds)
            return result

    def kill(self, channel_uuid: str) -> dict[str, Any]:
        reply = self._api(f"uuid_kill {channel_uuid} NORMAL_CLEARING").strip()
        if reply.lower().startswith("-err"):
            raise RuntimeError(reply)
        with self._lock:
            self._cached = None
        return {"ok": True, "uuid": channel_uuid, "reply": reply}

    def eavesdrop(
        self,
        admin_extension: str,
        target_uuid: str,
        sip_endpoint: str | None = None,
        mode: str = "listen",
        *,
        kamailio_host: str | None = None,
    ) -> dict[str, Any]:
        target_endpoint = sip_endpoint or kamailio_host
        if not target_endpoint:
            raise ValueError("SIP endpoint is required")
        if mode != "listen":
            raise ValueError("Only silent listen mode is supported")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", admin_extension):
            raise ValueError("Invalid monitoring extension")
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", target_uuid):
            raise ValueError("Invalid call UUID")
        if not re.fullmatch(r"[A-Za-z0-9.:[\]-]+(?::\d+)?", target_endpoint):
            raise ValueError("Invalid SIP endpoint")
        channel_vars = (
            "{sip_h_X-Dest-Type=SIP_USER,"
            "absolute_codec_string='PCMU,PCMA',"
            "eavesdrop_whisper_aleg=false,"
            "eavesdrop_whisper_bleg=false,"
            "eavesdrop_enable_dtmf=false,"
            "eavesdrop_indicate_failed=true}"
        )
        command = (
            f"originate {channel_vars}sofia/internal/{admin_extension}"
            f"@{target_endpoint} &eavesdrop({target_uuid})"
        )
        reply = self._api(command).strip()
        if reply.lower().startswith("-err"):
            raise RuntimeError(reply)
        return {
            "ok": True,
            "extension": admin_extension,
            "callUuid": target_uuid,
            "sipEndpoint": target_endpoint,
            "mode": mode,
            "reply": reply,
        }

    def _rows(self, command: str) -> list[dict[str, Any]]:
        payload = json.loads(self._api(command) or "{}")
        rows = payload.get("rows", payload if isinstance(payload, list) else [])
        return rows if isinstance(rows, list) else []

    def _api(self, command: str) -> str:
        with socket.create_connection((self.host, self.port), timeout=3) as sock:
            sock.settimeout(5)
            self._read_frame(sock)
            sock.sendall(f"auth {self.password}\n\n".encode())
            auth_headers, auth_body = self._read_frame(sock)
            if "+OK accepted" not in (auth_body or auth_headers.get("Reply-Text", "")):
                raise ConnectionError("FreeSWITCH ESL authentication failed")
            sock.sendall(f"api {command}\n\n".encode())
            _headers, body = self._read_frame(sock)
            return body

    def _api_batch(self, commands: list[str]) -> list[str]:
        """Read call variables over one local ESL connection, not one per call."""
        if not commands:
            return []
        with socket.create_connection((self.host, self.port), timeout=3) as sock:
            sock.settimeout(5)
            self._read_frame(sock)
            sock.sendall(f"auth {self.password}\n\n".encode())
            auth_headers, auth_body = self._read_frame(sock)
            if "+OK accepted" not in (auth_body or auth_headers.get("Reply-Text", "")):
                raise ConnectionError("FreeSWITCH ESL authentication failed")
            replies = []
            for command in commands:
                sock.sendall(f"api {command}\n\n".encode())
                _headers, body = self._read_frame(sock)
                replies.append(body)
            return replies

    @staticmethod
    def _read_frame(sock: socket.socket) -> tuple[dict[str, str], str]:
        data = bytearray()
        while b"\n\n" not in data and b"\r\n\r\n" not in data:
            chunk = sock.recv(4096)
            if not chunk:
                raise ConnectionError("FreeSWITCH ESL closed the connection")
            data.extend(chunk)
        separator = b"\r\n\r\n" if b"\r\n\r\n" in data else b"\n\n"
        header_data, body = bytes(data).split(separator, 1)
        headers = {}
        for line in header_data.decode(errors="replace").splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                headers[key.strip()] = value.strip()
        length = int(headers.get("Content-Length", "0"))
        while len(body) < length:
            body += sock.recv(length - len(body))
        return headers, body[:length].decode(errors="replace")

    @staticmethod
    def _summarize(calls: list[dict[str, Any]], channels: list[dict[str, Any]]) -> dict[str, Any]:
        channel_by_uuid = {str(row.get("uuid")): row for row in channels if row.get("uuid")}
        now = int(time.time())
        rows: dict[str, dict[str, Any]] = {}
        for row in calls:
            uuid = str(row.get("uuid") or row.get("call_uuid") or "")
            if not uuid:
                continue
            rows.setdefault(uuid, row)

        # Only explicit FreeSWITCH identifiers may join legs. Matching caller,
        # destination or timestamps would merge simultaneous unrelated calls.
        parent = {uuid: uuid for uuid in rows}

        def root(uuid: str) -> str:
            while parent[uuid] != uuid:
                parent[uuid] = parent[parent[uuid]]
                uuid = parent[uuid]
            return uuid

        def join(first: str, second: str) -> None:
            if second in parent:
                parent[root(first)] = root(second)

        by_call_uuid: dict[str, str] = {}
        for uuid, row in rows.items():
            channel = channel_by_uuid.get(uuid, {})
            for value in (row.get("call_uuid"), channel.get("call_uuid")):
                call_uuid = str(value or "")
                if call_uuid:
                    join(uuid, call_uuid)
                    if call_uuid in by_call_uuid:
                        join(uuid, by_call_uuid[call_uuid])
                    else:
                        by_call_uuid[call_uuid] = uuid
            for value in (row.get("b_uuid"), channel.get("b_uuid")):
                join(uuid, str(value or ""))

        groups: dict[str, list[str]] = {}
        for uuid in rows:
            groups.setdefault(root(uuid), []).append(uuid)

        normalized = []
        for uuids in groups.values():
            def priority(uuid: str) -> tuple[int, int, int, int, str]:
                row = rows[uuid]
                channel = channel_by_uuid.get(uuid, {})
                call_uuid = str(row.get("call_uuid") or channel.get("call_uuid") or "")
                direction = str(row.get("direction") or channel.get("direction") or "").lower()
                return (
                    0 if call_uuid == uuid else 1,
                    0 if direction == "inbound" else 1,
                    0 if row.get("accountcode") or channel.get("accountcode") else 1,
                    int(row.get("created_epoch") or channel.get("created_epoch") or now),
                    uuid,
                )

            uuids.sort(key=priority)
            uuid = uuids[0]
            row = rows[uuid]
            channel = channel_by_uuid.get(uuid, {})
            created = min(
                int(rows[leg].get("created_epoch") or channel_by_uuid.get(leg, {}).get("created_epoch") or now)
                for leg in uuids
            )
            business_direction = str(
                row.get("billing_direction") or channel.get("billing_direction")
                or row.get("variable_billing_direction") or channel.get("variable_billing_direction") or "unknown"
            ).lower()
            if business_direction not in ("inbound", "outbound"):
                business_direction = "unknown"
            b_uuid = str(row.get("b_uuid") or "")
            if b_uuid not in uuids:
                b_uuid = next((leg for leg in uuids if leg != uuid), "")
            leg_uuids = list(uuids)
            if b_uuid and b_uuid in channel_by_uuid and b_uuid not in leg_uuids:
                leg_uuids.append(b_uuid)
            normalized.append({
                "uuid": uuid,
                "bUuid": b_uuid or None,
                "legUuids": leg_uuids,
                "direction": business_direction,
                "accountcode": row.get("accountcode") or channel.get("accountcode"),
                "callerName": row.get("cid_name") or channel.get("cid_name"),
                "callerNumber": row.get("cid_num") or channel.get("cid_num"),
                "destinationNumber": row.get("dest") or channel.get("dest"),
                "calleeName": row.get("callee_name") or channel.get("callee_name"),
                "calleeNumber": row.get("callee_num") or channel.get("callee_num"),
                "state": row.get("callstate") or row.get("state") or channel.get("callstate") or channel.get("state"),
                "createdEpoch": created,
                "durationSeconds": max(0, now - created),
                "readCodec": row.get("read_codec") or channel.get("read_codec"),
                "writeCodec": row.get("write_codec") or channel.get("write_codec"),
                "remoteIp": row.get("ip_addr") or channel.get("ip_addr"),
            })
        directions = [call["direction"] for call in normalized]
        return {
            "ok": True,
            "calls": normalized,
            "summary": {
                "activeCalls": len(normalized),
                "activeChannels": len(channels),
                "inbound": directions.count("inbound"),
                "outbound": directions.count("outbound"),
                "activeTenants": len({call["accountcode"] for call in normalized if call["accountcode"]}),
            },
            "polledAt": int(time.time()),
        }
