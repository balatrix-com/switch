"""Transactional promotion of READY raw events into final CDR rows."""

from __future__ import annotations

from pathlib import Path

import psycopg2.pool

from .config import (
    AUTO_CREATE_SCHEMA,
    BATCH_SIZE,
    DATABASE_URL,
    DB_POOL_MAX,
    DB_POOL_MIN,
    psycopg_dsn,
)


class LiveCallToCdrRepository:
    def __init__(self, database_url: str = DATABASE_URL):
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
        schema_path = Path(__file__).resolve().parent.parent / "schema.sql"
        connection = self.pool.getconn()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(schema_path.read_text(encoding="utf-8"))
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

    def promote_ready(self, batch_size: int = BATCH_SIZE) -> int:
        """Atomically promote one batch; concurrent workers cannot claim it twice."""
        connection = self.pool.getconn()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT id
                        FROM live_call_event
                        WHERE merge_status = 'READY'
                          AND cdr_export_status = 'PENDING'
                        ORDER BY finalized_at, id
                        FOR UPDATE SKIP LOCKED
                        LIMIT %s
                        """,
                        (batch_size,),
                    )
                    event_ids = [row[0] for row in cursor.fetchall()]
                    if not event_ids:
                        return 0

                    cursor.execute(
                        """
                        INSERT INTO cdr (
                            live_call_event_id, session_uuid, switch_name,
                            customer_id, direction, direction_source,
                            source_ip, source_port, caller_number,
                            destination_number, route_id, customer_number_id,
                            customer_endpoint_id, carrier_id, carrier_endpoint_id,
                            started_at, answered_at, bridged_at, ended_at,
                            duration_seconds, billsec, carrier_billsec, answered,
                            call_status, hangup_cause, hangup_cause_q850,
                            sip_hangup_disposition, leg_count, rating_status,
                            created_at, updated_at
                        )
                        SELECT
                            event.id, event.session_uuid, event.switch_name,
                            event.customer_id, event.direction, event.direction_source,
                            event.source_ip, event.source_port, event.caller_number,
                            event.destination_number, event.route_id,
                            event.customer_number_id, event.customer_endpoint_id,
                            event.carrier_id, event.carrier_endpoint_id,
                            event.started_at, event.answered_at, event.bridged_at,
                            event.ended_at, COALESCE(event.duration_seconds, 0),
                            COALESCE(event.billsec, 0),
                            COALESCE(event.carrier_billsec, 0), event.answered,
                            CASE
                                WHEN event.answered THEN 'ANSWERED'
                                WHEN event.hangup_cause IN ('NO_ANSWER', 'NO_USER_RESPONSE') THEN 'NO_ANSWER'
                                WHEN event.hangup_cause = 'USER_BUSY' THEN 'BUSY'
                                ELSE 'FAILED'
                            END,
                            event.hangup_cause, event.hangup_cause_q850,
                            event.sip_hangup_disposition, event.leg_count,
                            'PENDING', event.created_at, NOW()
                        FROM live_call_event AS event
                        WHERE event.id = ANY(%s)
                          AND event.customer_id IS NOT NULL
                          AND event.direction IS NOT NULL
                          AND event.direction_conflict = FALSE
                        ON CONFLICT (session_uuid) DO UPDATE SET
                            live_call_event_id = EXCLUDED.live_call_event_id,
                            switch_name = EXCLUDED.switch_name,
                            customer_id = EXCLUDED.customer_id,
                            direction = EXCLUDED.direction,
                            direction_source = EXCLUDED.direction_source,
                            source_ip = EXCLUDED.source_ip,
                            source_port = EXCLUDED.source_port,
                            caller_number = EXCLUDED.caller_number,
                            destination_number = EXCLUDED.destination_number,
                            route_id = EXCLUDED.route_id,
                            customer_number_id = EXCLUDED.customer_number_id,
                            customer_endpoint_id = EXCLUDED.customer_endpoint_id,
                            carrier_id = EXCLUDED.carrier_id,
                            carrier_endpoint_id = EXCLUDED.carrier_endpoint_id,
                            started_at = EXCLUDED.started_at,
                            answered_at = EXCLUDED.answered_at,
                            bridged_at = EXCLUDED.bridged_at,
                            ended_at = EXCLUDED.ended_at,
                            duration_seconds = EXCLUDED.duration_seconds,
                            billsec = EXCLUDED.billsec,
                            carrier_billsec = EXCLUDED.carrier_billsec,
                            answered = EXCLUDED.answered,
                            call_status = EXCLUDED.call_status,
                            hangup_cause = EXCLUDED.hangup_cause,
                            hangup_cause_q850 = EXCLUDED.hangup_cause_q850,
                            sip_hangup_disposition = EXCLUDED.sip_hangup_disposition,
                            leg_count = EXCLUDED.leg_count,
                            rating_status = CASE
                                WHEN cdr.rating_status = 'RATED' THEN 'REVIEW'
                                ELSE 'PENDING'
                            END,
                            rated_seconds = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.rated_seconds
                                ELSE NULL
                            END,
                            carrier_rated_seconds = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.carrier_rated_seconds
                                ELSE NULL
                            END,
                            rate_card_id = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.rate_card_id
                                ELSE NULL
                            END,
                            carrier_rate_card_id = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.carrier_rate_card_id
                                ELSE NULL
                            END,
                            carrier_rate_card_version = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.carrier_rate_card_version
                                ELSE NULL
                            END,
                            customer_minimum_billing_id = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.customer_minimum_billing_id
                                ELSE NULL
                            END,
                            carrier_minimum_billing_id = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.carrier_minimum_billing_id
                                ELSE NULL
                            END,
                            customer_initial_increment_seconds = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.customer_initial_increment_seconds
                                ELSE NULL
                            END,
                            carrier_initial_increment_seconds = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.carrier_initial_increment_seconds
                                ELSE NULL
                            END,
                            customer_billing_increment_seconds = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.customer_billing_increment_seconds
                                ELSE NULL
                            END,
                            carrier_billing_increment_seconds = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.carrier_billing_increment_seconds
                                ELSE NULL
                            END,
                            rate_card_version = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.rate_card_version
                                ELSE NULL
                            END,
                            sell_rate_per_minute = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.sell_rate_per_minute
                                ELSE NULL
                            END,
                            carrier_rate_per_minute = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.carrier_rate_per_minute
                                ELSE NULL
                            END,
                            carrier_currency = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.carrier_currency
                                ELSE NULL
                            END,
                            customer_charge = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.customer_charge
                                ELSE NULL
                            END,
                            carrier_cost = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.carrier_cost
                                ELSE NULL
                            END,
                            rating_error = CASE
                                WHEN cdr.rating_status = 'RATED'
                                    THEN 'Late call leg changed an already-rated CDR'
                                ELSE NULL
                            END,
                            rating_started_at = NULL,
                            rated_at = CASE
                                WHEN cdr.rating_status = 'RATED' THEN cdr.rated_at
                                ELSE NULL
                            END,
                            updated_at = NOW()
                        """,
                        (event_ids,),
                    )

                    cursor.execute(
                        """
                        UPDATE live_call_event
                        SET cdr_export_status = 'COMPLETED',
                            cdr_export_error = NULL,
                            cdr_exported_at = NOW(),
                            updated_at = NOW()
                        WHERE id = ANY(%s)
                        """,
                        (event_ids,),
                    )
                    return len(event_ids)
        finally:
            self.pool.putconn(connection)
