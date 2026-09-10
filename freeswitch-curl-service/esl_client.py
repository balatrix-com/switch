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

    def live_calls(self) -> dict[str, Any]:
        with self._lock:
            if self._cached and self._cached[1] > time.monotonic():
                return self._cached[0]
            calls = self._rows("show calls as json")
            channels = self._rows("show channels as json")
            result = self._summarize(calls, channels)
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
        normalized = []
        seen: set[str] = set()
        for row in calls:
            uuid = str(row.get("uuid") or row.get("call_uuid") or "")
            if not uuid or uuid in seen:
                continue
            seen.add(uuid)
            channel = channel_by_uuid.get(uuid, {})
            direction = str(row.get("direction") or channel.get("direction") or "unknown").lower()
            created = int(row.get("created_epoch") or channel.get("created_epoch") or now)
            normalized.append({
                "uuid": uuid,
                "bUuid": row.get("b_uuid"),
                "direction": direction,
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
