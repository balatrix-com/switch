"""Optional PostgreSQL integration tests for the two-table CDR pipeline."""

from __future__ import annotations

import os
import unittest
import uuid
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psycopg2


def database_url_for_schema(database_url: str, schema_name: str) -> str:
    parsed = urlparse(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.pop("schema", None)
    query["options"] = f"-csearch_path={schema_name}"
    return urlunparse(parsed._replace(query=urlencode(query)))


@unittest.skipUnless(
    os.getenv("CDR_TEST_DATABASE_URL"),
    "set CDR_TEST_DATABASE_URL to run PostgreSQL integration tests",
)
class CdrPipelineIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.admin_url = os.environ["CDR_TEST_DATABASE_URL"]
        os.environ.setdefault("DATABASE_URL", cls.admin_url)
        from livecall_to_cdr.repository import LiveCallToCdrRepository

        cls.schema_name = f"cdr_pipeline_test_{uuid.uuid4().hex}"
        parsed = urlparse(cls.admin_url)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        query.pop("schema", None)
        cls.admin_dsn = urlunparse(parsed._replace(query=urlencode(query)))
        with psycopg2.connect(cls.admin_dsn) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f'CREATE SCHEMA "{cls.schema_name}"')

        cls.repository = LiveCallToCdrRepository(
            database_url_for_schema(cls.admin_url, cls.schema_name)
        )
        cls.repository.initialize()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.repository.close()
        with psycopg2.connect(cls.admin_dsn) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f'DROP SCHEMA "{cls.schema_name}" CASCADE')

    def test_collector_merges_b_then_a_before_worker_promotes(self) -> None:
        schema_url = database_url_for_schema(self.admin_url, self.schema_name)
        previous_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = schema_url
        try:
            import cdr_server
        finally:
            if previous_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous_url

        cdr_server.REPOSITORY.close()
        collector = cdr_server.CdrRepository(schema_url)
        try:
            b_leg = cdr_server.parse_cdr(
                {
                    "channel_data": {"direction": "outbound"},
                    "variables": {
                        "uuid": "collector-b-leg",
                        "originating_leg_uuid": "collector-session",
                        "billing_session_id": "collector-session",
                        "billing_direction": "OUTBOUND",
                        "billing_customer_id": "collector-customer",
                        "billsec": "30",
                        "hangup_cause": "NORMAL_CLEARING",
                    },
                }
            )
            a_leg = cdr_server.parse_cdr(
                {
                    "channel_data": {"direction": "inbound"},
                    "variables": {
                        "uuid": "collector-session",
                        "billing_session_id": "collector-session",
                        "billing_direction": "OUTBOUND",
                        "billing_customer_id": "collector-customer",
                        "caller_id_number": "14372905077",
                        "billing_normalized_number": "15802051753",
                        "duration": "35",
                        "billsec": "30",
                        "hangup_cause": "NORMAL_CLEARING",
                    },
                }
            )

            collector.merge(b_leg)
            merged = collector.merge(a_leg)
            self.assertEqual(merged["leg_count"], 2)
            connection = collector.pool.getconn()
            try:
                with connection:
                    with connection.cursor() as cursor:
                        cursor.execute(
                            """
                            UPDATE live_call_event
                            SET last_leg_received_at = NOW() - INTERVAL '120 seconds'
                            WHERE session_uuid = 'collector-session'
                            """
                        )
            finally:
                collector.pool.putconn(connection)

            self.assertEqual(collector.finalize_ready(), 1)
        finally:
            collector.close()

        self.assertEqual(self.repository.promote_ready(), 1)
        connection = self.repository.pool.getconn()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT customer_id, direction, billsec, leg_count, rating_status
                    FROM cdr WHERE session_uuid = 'collector-session'
                    """
                )
                self.assertEqual(
                    cursor.fetchone(),
                    ("collector-customer", "OUTBOUND", 30, 2, "PENDING"),
                )
        finally:
            self.repository.pool.putconn(connection)

    def test_ready_event_is_promoted_once_and_late_leg_requires_review(self) -> None:
        connection = self.repository.pool.getconn()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO live_call_event (
                            session_uuid, customer_id, direction, caller_number,
                            destination_number, duration_seconds, billsec,
                            carrier_billsec, answered, hangup_cause, a_leg_uuid,
                            leg_count, merge_status, cdr_export_status, finalized_at
                        ) VALUES (
                            'session-1', 'customer-1', 'OUTBOUND', '14372905077',
                            '15802051753', 42, 37, 37, TRUE, 'NORMAL_CLEARING',
                            'a-leg-1', 2, 'READY', 'PENDING', NOW()
                        )
                        """
                    )
        finally:
            self.repository.pool.putconn(connection)

        self.assertEqual(self.repository.promote_ready(), 1)
        self.assertEqual(self.repository.promote_ready(), 0)

        connection = self.repository.pool.getconn()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT rating_status, billsec, call_status
                        FROM cdr WHERE session_uuid = 'session-1'
                        """
                    )
                    self.assertEqual(cursor.fetchone(), ("PENDING", 37, "ANSWERED"))
                    cursor.execute(
                        """
                        UPDATE cdr SET
                            rating_status = 'RATED', customer_charge = 1.25,
                            carrier_cost = 0.75, rated_at = NOW()
                        WHERE session_uuid = 'session-1'
                        """
                    )
                    cursor.execute(
                        """
                        UPDATE live_call_event SET
                            billsec = 40, leg_count = 3,
                            cdr_export_status = 'PENDING'
                        WHERE session_uuid = 'session-1'
                        """
                    )
        finally:
            self.repository.pool.putconn(connection)

        self.assertEqual(self.repository.promote_ready(), 1)
        connection = self.repository.pool.getconn()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT rating_status, billsec, customer_charge, carrier_cost,
                           rating_error
                    FROM cdr WHERE session_uuid = 'session-1'
                    """
                )
                status, billsec, charge, cost, error = cursor.fetchone()
                self.assertEqual(status, "REVIEW")
                self.assertEqual(billsec, 40)
                self.assertEqual(float(charge), 1.25)
                self.assertEqual(float(cost), 0.75)
                self.assertIn("Late call leg", error)
                cursor.execute(
                    """
                    SELECT COUNT(*) FROM information_schema.columns
                    WHERE table_schema = %s
                      AND table_name = 'live_call_event'
                      AND column_name IN (
                          'rating_status', 'rate_card_id', 'currency',
                          'customer_charge', 'carrier_cost'
                      )
                    """,
                    (self.schema_name,),
                )
                self.assertEqual(cursor.fetchone()[0], 0)
        finally:
            self.repository.pool.putconn(connection)

    def test_legacy_cdrs_table_is_renamed_and_billing_data_is_preserved(self) -> None:
        legacy_schema = f"cdr_legacy_test_{uuid.uuid4().hex}"
        legacy_url = database_url_for_schema(self.admin_url, legacy_schema)
        try:
            with psycopg2.connect(self.admin_dsn) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(f'CREATE SCHEMA "{legacy_schema}"')

            with psycopg2.connect(legacy_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        CREATE TABLE cdrs (
                            id BIGSERIAL PRIMARY KEY,
                            session_uuid TEXT NOT NULL UNIQUE,
                            switch_name TEXT, core_uuid TEXT, customer_id TEXT,
                            direction TEXT, direction_source TEXT,
                            direction_conflict BOOLEAN NOT NULL DEFAULT FALSE,
                            source_ip TEXT, source_port INTEGER,
                            caller_number TEXT, destination_number TEXT,
                            route_id TEXT, customer_number_id TEXT,
                            customer_endpoint_id TEXT, carrier_id TEXT,
                            carrier_endpoint_id TEXT, started_at TIMESTAMPTZ,
                            answered_at TIMESTAMPTZ, bridged_at TIMESTAMPTZ,
                            ended_at TIMESTAMPTZ, duration_seconds INTEGER,
                            billsec INTEGER, carrier_billsec INTEGER,
                            answered BOOLEAN NOT NULL DEFAULT FALSE,
                            hangup_cause TEXT, hangup_cause_q850 INTEGER,
                            sip_hangup_disposition TEXT, a_leg_uuid TEXT,
                            a_leg_json JSONB, b_leg_uuids TEXT[] NOT NULL DEFAULT '{}',
                            b_legs_json JSONB NOT NULL DEFAULT '[]',
                            leg_count INTEGER NOT NULL DEFAULT 0,
                            merge_status TEXT NOT NULL DEFAULT 'COLLECTING',
                            rating_status TEXT NOT NULL DEFAULT 'WAITING',
                            rated_seconds INTEGER, rate_card_id TEXT,
                            rate_card_version TEXT, currency VARCHAR(3),
                            sell_rate_per_minute NUMERIC(18,6),
                            carrier_rate_per_minute NUMERIC(18,6),
                            customer_charge NUMERIC(18,6), carrier_cost NUMERIC(18,6),
                            rating_error TEXT, rated_at TIMESTAMPTZ,
                            ingest_count INTEGER NOT NULL DEFAULT 1,
                            first_leg_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            last_leg_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            finalized_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        );
                        INSERT INTO cdrs (
                            session_uuid, customer_id, direction, caller_number,
                            destination_number, duration_seconds, billsec, answered,
                            hangup_cause, a_leg_uuid, leg_count, merge_status,
                            rating_status, rated_seconds, currency,
                            sell_rate_per_minute, carrier_rate_per_minute,
                            customer_charge, carrier_cost, rated_at, finalized_at
                        ) VALUES (
                            'legacy-session', 'legacy-customer', 'OUTBOUND',
                            '14372905077', '15802051753', 61, 60, TRUE,
                            'NORMAL_CLEARING', 'legacy-a-leg', 2, 'READY',
                            'RATED', 60, 'USD', 0.12, 0.08, 0.12, 0.08,
                            NOW(), NOW()
                        );
                        """
                    )
                    schema_sql = (
                        Path(__file__).resolve().parent / "schema.sql"
                    ).read_text(encoding="utf-8")
                    cursor.execute(schema_sql)
                    cursor.execute("SELECT to_regclass('cdrs'), to_regclass('live_call_event')")
                    old_table, raw_table = cursor.fetchone()
                    self.assertIsNone(old_table)
                    self.assertEqual(raw_table, "live_call_event")

                    cursor.execute(
                        """
                        SELECT rating_status, rated_seconds, customer_charge, carrier_cost
                        FROM cdr WHERE session_uuid = 'legacy-session'
                        """
                    )
                    status, seconds, charge, cost = cursor.fetchone()
                    self.assertEqual((status, seconds), ("RATED", 60))
                    self.assertEqual(float(charge), 0.12)
                    self.assertEqual(float(cost), 0.08)

                    cursor.execute(
                        """
                        SELECT cdr_export_status
                        FROM live_call_event WHERE session_uuid = 'legacy-session'
                        """
                    )
                    self.assertEqual(cursor.fetchone()[0], "COMPLETED")
                    cursor.execute(
                        """
                        SELECT COUNT(*) FROM information_schema.columns
                        WHERE table_schema = %s AND table_name = 'live_call_event'
                          AND column_name IN ('rating_status', 'customer_charge', 'carrier_cost')
                        """,
                        (legacy_schema,),
                    )
                    self.assertEqual(cursor.fetchone()[0], 0)
        finally:
            with psycopg2.connect(self.admin_dsn) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(f'DROP SCHEMA IF EXISTS "{legacy_schema}" CASCADE')


if __name__ == "__main__":
    unittest.main()
