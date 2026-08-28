#!/usr/bin/env python3
"""HTTP collector for FreeSWITCH mod_json_cdr payloads."""

from __future__ import annotations

import base64
import hmac
import json
import logging
import os
import signal
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, parse_qsl, urlencode, urlparse, urlunparse

import psycopg2.extras
import psycopg2.pool

from cdr_processor import CdrLeg, parse_cdr


BASE_DIRECTORY = Path(__file__).resolve().parent


def load_env_file() -> None:
    env_path = BASE_DIRECTORY / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key.replace("_", "").isalnum():
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def boolean_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def psycopg_dsn(database_url: str) -> str:
    parsed = urlparse(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.pop("schema", None)
    return urlunparse(parsed._replace(query=urlencode(query)))


load_env_file()

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "9000"))
DATABASE_URL = os.environ["DATABASE_URL"]
DB_POOL_MIN = int(os.getenv("DB_POOL_MIN", "1"))
DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "10"))
AUTO_CREATE_SCHEMA = boolean_env("AUTO_CREATE_SCHEMA", True)
MERGE_WAIT_SECONDS = int(os.getenv("MERGE_WAIT_SECONDS", "60"))
FINALIZER_INTERVAL_SECONDS = int(os.getenv("FINALIZER_INTERVAL_SECONDS", "10"))
MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", str(5 * 1024 * 1024)))
CDR_USERNAME = os.getenv("CDR_USERNAME", "")
CDR_PASSWORD = os.getenv("CDR_PASSWORD", "")

if bool(CDR_USERNAME) != bool(CDR_PASSWORD):
    raise RuntimeError("CDR_USERNAME and CDR_PASSWORD must either both be set or both be empty")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [CDR] %(message)s",
)
LOGGER = logging.getLogger("cdr-service")


class CdrRepository:
    def __init__(self, database_url: str):
        self.pool = psycopg2.pool.ThreadedConnectionPool(
            DB_POOL_MIN,
            DB_POOL_MAX,
            dsn=psycopg_dsn(database_url),
        )

    def close(self) -> None:
        self.pool.closeall()

    def initialize(self) -> None:
        if not AUTO_CREATE_SCHEMA:
            return
        schema = (BASE_DIRECTORY / "schema.sql").read_text(encoding="utf-8")
        connection = self.pool.getconn()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(schema)
        finally:
            self.pool.putconn(connection)

    def healthy(self) -> bool:
        connection = self.pool.getconn()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                return cursor.fetchone() == (1,)
        finally:
            self.pool.putconn(connection)

    def enrich_from_source_auth(self, leg: CdrLeg) -> None:
        if not leg.source_ip:
            return
        if leg.direction == "OUTBOUND" and leg.customer_id:
            return
        if leg.direction == "INBOUND" and leg.customer_id and leg.carrier_id:
            return
        connection = self.pool.getconn()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT source_type::text, customer_id::text, carrier_id::text,
                           customer_endpoint_id::text, carrier_endpoint_id::text
                    FROM source_ip_auth
                    WHERE is_active = TRUE
                      AND ip_address = %s
                      AND (port = 0 OR %s IS NULL OR port = %s)
                    ORDER BY CASE WHEN port = %s THEN 0 ELSE 1 END, created_at
                    LIMIT 1
                    """,
                    (leg.source_ip, leg.source_port, leg.source_port, leg.source_port),
                )
                row = cursor.fetchone()
        finally:
            self.pool.putconn(connection)

        if not row:
            return
        (
            source_type,
            customer_id,
            carrier_id,
            customer_endpoint_id,
            carrier_endpoint_id,
        ) = row
        if not leg.direction:
            leg.direction = "OUTBOUND" if source_type == "CUSTOMER" else "INBOUND"
            leg.direction_source = "source_ip_auth"
        if not leg.customer_id and customer_id:
            leg.customer_id = customer_id
        if not leg.carrier_id and carrier_id:
            leg.carrier_id = carrier_id
        if not leg.customer_endpoint_id and customer_endpoint_id:
            leg.customer_endpoint_id = customer_endpoint_id
        if not leg.carrier_endpoint_id and carrier_endpoint_id:
            leg.carrier_endpoint_id = carrier_endpoint_id

    def merge(self, leg: CdrLeg) -> dict[str, Any]:
        self.enrich_from_source_auth(leg)
        connection = self.pool.getconn()
        try:
            with connection:
                with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    cursor.execute(
                        "SELECT * FROM live_call_event WHERE session_uuid = %s FOR UPDATE",
                        (leg.session_uuid,),
                    )
                    existing = cursor.fetchone()
                    if existing is None:
                        self._insert(cursor, leg)
                        duplicate = False
                    else:
                        duplicate = self._update(cursor, dict(existing), leg)

                    cursor.execute(
                        """
                        SELECT id, session_uuid, direction, customer_id, merge_status,
                               cdr_export_status, leg_count, direction_conflict
                        FROM live_call_event
                        WHERE session_uuid = %s
                        """,
                        (leg.session_uuid,),
                    )
                    result = dict(cursor.fetchone())
                    result["duplicate"] = duplicate
                    result["legRole"] = leg.leg_role
                    result["legUuid"] = leg.leg_uuid
                    return result
        finally:
            self.pool.putconn(connection)

    def _insert(self, cursor: Any, leg: CdrLeg) -> None:
        is_a_leg = leg.leg_role == "A"
        cursor.execute(
            """
            INSERT INTO live_call_event (
                session_uuid, switch_name, core_uuid, customer_id,
                direction, direction_source, source_ip, source_port,
                caller_number, destination_number, route_id, customer_number_id,
                customer_endpoint_id, carrier_id, carrier_endpoint_id,
                started_at, answered_at, bridged_at, ended_at,
                duration_seconds, billsec, carrier_billsec, answered,
                hangup_cause, hangup_cause_q850, sip_hangup_disposition,
                a_leg_uuid, a_leg_sip_call_id, a_leg_json,
                b_leg_uuids, b_leg_sip_call_ids, b_legs_json, leg_count
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, 1
            )
            """,
            (
                leg.session_uuid,
                leg.switch_name,
                leg.core_uuid,
                leg.customer_id,
                leg.direction,
                leg.direction_source,
                leg.source_ip,
                leg.source_port,
                leg.caller_number,
                leg.destination_number,
                leg.route_id,
                leg.customer_number_id,
                leg.customer_endpoint_id,
                leg.carrier_id,
                leg.carrier_endpoint_id,
                leg.started_at,
                leg.answered_at,
                leg.bridged_at,
                leg.ended_at,
                leg.duration_seconds if is_a_leg else None,
                leg.billsec if is_a_leg else None,
                leg.billsec if not is_a_leg else None,
                leg.answered,
                leg.hangup_cause,
                leg.hangup_cause_q850,
                leg.sip_hangup_disposition,
                leg.leg_uuid if is_a_leg else None,
                leg.sip_call_id if is_a_leg else None,
                psycopg2.extras.Json(leg.payload) if is_a_leg else None,
                [] if is_a_leg else [leg.leg_uuid],
                [] if is_a_leg or not leg.sip_call_id else [leg.sip_call_id],
                psycopg2.extras.Json([] if is_a_leg else [leg.payload]),
            ),
        )

    def _update(self, cursor: Any, row: dict[str, Any], leg: CdrLeg) -> bool:
        existing_b_uuids = list(row.get("b_leg_uuids") or [])
        duplicate = leg.leg_uuid == row.get("a_leg_uuid") or leg.leg_uuid in existing_b_uuids
        if duplicate:
            cursor.execute(
                "UPDATE live_call_event SET ingest_count = ingest_count + 1 WHERE session_uuid = %s",
                (leg.session_uuid,),
            )
            return True

        existing_direction = row.get("direction")
        direction_conflict = bool(row.get("direction_conflict"))
        if existing_direction and leg.direction and existing_direction != leg.direction:
            direction_conflict = True
            LOGGER.error(
                "direction conflict session=%s stored=%s received=%s leg=%s",
                leg.session_uuid,
                existing_direction,
                leg.direction,
                leg.leg_uuid,
            )
        direction = existing_direction or leg.direction
        direction_source = row.get("direction_source") or leg.direction_source

        is_a_leg = leg.leg_role == "A"
        b_legs = list(row.get("b_legs_json") or [])
        b_leg_sip_call_ids = list(row.get("b_leg_sip_call_ids") or [])
        if not is_a_leg:
            existing_b_uuids.append(leg.leg_uuid)
            b_legs.append(leg.payload)
            if leg.sip_call_id and leg.sip_call_id not in b_leg_sip_call_ids:
                b_leg_sip_call_ids.append(leg.sip_call_id)

        def prefer_leg(field: str, incoming: Any) -> Any:
            if is_a_leg and incoming is not None:
                return incoming
            stored = row.get(field)
            return stored if stored is not None else incoming

        cursor.execute(
            """
            UPDATE live_call_event SET
                switch_name = COALESCE(%s, switch_name),
                core_uuid = COALESCE(%s, core_uuid),
                customer_id = COALESCE(%s, customer_id),
                direction = %s,
                direction_source = %s,
                direction_conflict = %s,
                source_ip = COALESCE(%s, source_ip),
                source_port = COALESCE(%s, source_port),
                caller_number = %s,
                destination_number = %s,
                route_id = COALESCE(%s, route_id),
                customer_number_id = COALESCE(%s, customer_number_id),
                customer_endpoint_id = COALESCE(%s, customer_endpoint_id),
                carrier_id = COALESCE(%s, carrier_id),
                carrier_endpoint_id = COALESCE(%s, carrier_endpoint_id),
                started_at = %s,
                answered_at = %s,
                bridged_at = %s,
                ended_at = %s,
                duration_seconds = %s,
                billsec = %s,
                carrier_billsec = GREATEST(COALESCE(carrier_billsec, 0), COALESCE(%s, 0)),
                answered = answered OR %s,
                hangup_cause = %s,
                hangup_cause_q850 = %s,
                sip_hangup_disposition = %s,
                a_leg_uuid = CASE WHEN %s THEN %s ELSE a_leg_uuid END,
                a_leg_sip_call_id = CASE WHEN %s THEN %s ELSE a_leg_sip_call_id END,
                a_leg_json = CASE WHEN %s THEN %s ELSE a_leg_json END,
                b_leg_uuids = %s,
                b_leg_sip_call_ids = %s,
                b_legs_json = %s,
                leg_count = leg_count + 1,
                merge_status = 'COLLECTING',
                cdr_export_status = 'WAITING',
                cdr_export_error = NULL,
                cdr_exported_at = NULL,
                finalized_at = NULL,
                last_leg_received_at = NOW(),
                updated_at = NOW()
            WHERE session_uuid = %s
            """,
            (
                leg.switch_name,
                leg.core_uuid,
                leg.customer_id,
                direction,
                direction_source,
                direction_conflict,
                leg.source_ip,
                leg.source_port,
                prefer_leg("caller_number", leg.caller_number),
                prefer_leg("destination_number", leg.destination_number),
                leg.route_id,
                leg.customer_number_id,
                leg.customer_endpoint_id,
                leg.carrier_id,
                leg.carrier_endpoint_id,
                prefer_leg("started_at", leg.started_at),
                prefer_leg("answered_at", leg.answered_at),
                prefer_leg("bridged_at", leg.bridged_at),
                prefer_leg("ended_at", leg.ended_at),
                prefer_leg("duration_seconds", leg.duration_seconds),
                prefer_leg("billsec", leg.billsec),
                leg.billsec if not is_a_leg else row.get("carrier_billsec"),
                leg.answered,
                prefer_leg("hangup_cause", leg.hangup_cause),
                prefer_leg("hangup_cause_q850", leg.hangup_cause_q850),
                prefer_leg("sip_hangup_disposition", leg.sip_hangup_disposition),
                is_a_leg,
                leg.leg_uuid,
                is_a_leg,
                leg.sip_call_id,
                is_a_leg,
                psycopg2.extras.Json(leg.payload),
                existing_b_uuids,
                b_leg_sip_call_ids,
                psycopg2.extras.Json(b_legs),
                leg.session_uuid,
            ),
        )
        return False

    def finalize_ready(self) -> int:
        connection = self.pool.getconn()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        UPDATE live_call_event SET
                            merge_status = 'READY',
                            cdr_export_status = CASE
                                WHEN direction_conflict THEN 'ERROR'
                                WHEN direction IS NULL OR customer_id IS NULL THEN 'ERROR'
                                ELSE 'PENDING'
                            END,
                            cdr_export_error = CASE
                                WHEN direction_conflict THEN 'Conflicting business direction received across call legs'
                                WHEN direction IS NULL THEN 'Business direction could not be determined'
                                WHEN customer_id IS NULL THEN 'Customer could not be determined'
                                ELSE NULL
                            END,
                            finalized_at = NOW(),
                            updated_at = NOW()
                        WHERE merge_status = 'COLLECTING'
                          AND a_leg_uuid IS NOT NULL
                          AND last_leg_received_at <= NOW() - (%s * INTERVAL '1 second')
                        """,
                        (MERGE_WAIT_SECONDS,),
                    )
                    return cursor.rowcount
        finally:
            self.pool.putconn(connection)


REPOSITORY = CdrRepository(DATABASE_URL)
STOP_EVENT = threading.Event()


def parse_request_payload(body: bytes, content_type: str) -> dict[str, Any]:
    text = body.decode("utf-8")
    if "application/x-www-form-urlencoded" in content_type:
        form = parse_qs(text, keep_blank_values=True)
        encoded = (form.get("cdr") or form.get("json") or [None])[0]
        if encoded is None:
            raise ValueError("Form body must contain a cdr or json field")
        text = encoded
    payload = json.loads(text)
    if not isinstance(payload, dict):
        raise ValueError("CDR payload must be a JSON object")
    return payload


class CdrHandler(BaseHTTPRequestHandler):
    server_version = "BillingSwitchCDR/2.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        LOGGER.info("%s %s", self.client_address[0], fmt % args)

    def _authorized(self) -> bool:
        if not CDR_USERNAME:
            return True
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Basic "):
            return False
        try:
            credentials = base64.b64decode(
                authorization.removeprefix("Basic "), validate=True
            ).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return False
        return hmac.compare_digest(credentials, f"{CDR_USERNAME}:{CDR_PASSWORD}")

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, default=str, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/health":
            self._send_json(404, {"error": "Not Found"})
            return
        try:
            healthy = REPOSITORY.healthy()
        except Exception:
            LOGGER.exception("health check failed")
            healthy = False
        self._send_json(
            200 if healthy else 503,
            {"status": "ok" if healthy else "unavailable", "database": healthy},
        )

    def do_POST(self) -> None:  # noqa: N802
        parsed_url = urlparse(self.path)
        if parsed_url.path != "/cdr":
            self._send_json(404, {"error": "Not Found"})
            return
        if not self._authorized():
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="cdr-service"')
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "Invalid Content-Length"})
            return
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self._send_json(413, {"error": "CDR body is empty or too large"})
            return

        try:
            body = self.rfile.read(content_length)
            payload = parse_request_payload(body, self.headers.get("Content-Type", ""))
            query_uuid = (parse_qs(parsed_url.query).get("uuid") or [None])[0]
            leg = parse_cdr(payload, query_uuid=query_uuid)
            result = REPOSITORY.merge(leg)
            self._send_json(
                200,
                {
                    "accepted": True,
                    "id": result["id"],
                    "sessionUuid": result["session_uuid"],
                    "legUuid": result["legUuid"],
                    "legRole": result["legRole"],
                    "direction": result["direction"],
                    "customerId": result["customer_id"],
                    "mergeStatus": result["merge_status"],
                    "cdrExportStatus": result["cdr_export_status"],
                    "legCount": result["leg_count"],
                    "duplicate": result["duplicate"],
                    "directionConflict": result["direction_conflict"],
                },
            )
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            self._send_json(400, {"error": str(error)})
        except Exception:
            LOGGER.exception("failed to store CDR")
            self._send_json(500, {"error": "Unable to store CDR"})


def finalizer_loop() -> None:
    while not STOP_EVENT.wait(FINALIZER_INTERVAL_SECONDS):
        try:
            finalized = REPOSITORY.finalize_ready()
            if finalized:
                LOGGER.info("finalized %s merged raw call event(s)", finalized)
        except Exception:
            LOGGER.exception("CDR finalizer failed")


def main() -> None:
    REPOSITORY.initialize()
    finalizer = threading.Thread(target=finalizer_loop, name="cdr-finalizer", daemon=True)
    finalizer.start()
    server = ThreadingHTTPServer((HOST, PORT), CdrHandler)
    server.daemon_threads = True

    def shutdown(_signum: int, _frame: Any) -> None:
        STOP_EVENT.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    LOGGER.info("listening on %s:%s", HOST, PORT)
    LOGGER.info("POST CDRs to /cdr; merge wait is %ss", MERGE_WAIT_SECONDS)
    try:
        server.serve_forever()
    finally:
        STOP_EVENT.set()
        server.server_close()
        REPOSITORY.close()


if __name__ == "__main__":
    main()
