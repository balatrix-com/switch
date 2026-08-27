-- Serialize schema application when collector and worker start together.
SELECT pg_advisory_xact_lock(hashtext('billing_switch_cdr_schema_v2'));

-- Preserve rows from the original combined table before splitting raw events
-- from final billing CDRs.
DO $$
BEGIN
    IF to_regclass('cdrs') IS NOT NULL
       AND to_regclass('live_call_event') IS NULL THEN
        ALTER TABLE cdrs RENAME TO live_call_event;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('cdrs_id_seq') IS NOT NULL
       AND to_regclass('live_call_event_id_seq') IS NULL THEN
        ALTER SEQUENCE cdrs_id_seq RENAME TO live_call_event_id_seq;
    END IF;
END $$;

-- Raw FreeSWITCH input plus fields required to correlate and merge call legs.
-- Rates, charges, currency, and rating state intentionally do not live here.
CREATE TABLE IF NOT EXISTS live_call_event (
    id BIGSERIAL PRIMARY KEY,
    session_uuid TEXT NOT NULL UNIQUE,
    switch_name TEXT,
    core_uuid TEXT,
    customer_id TEXT,
    direction TEXT CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    direction_source TEXT,
    direction_conflict BOOLEAN NOT NULL DEFAULT FALSE,
    source_ip TEXT,
    source_port INTEGER,
    caller_number TEXT,
    destination_number TEXT,
    route_id TEXT,
    customer_number_id TEXT,
    customer_endpoint_id TEXT,
    carrier_id TEXT,
    carrier_endpoint_id TEXT,
    started_at TIMESTAMPTZ,
    answered_at TIMESTAMPTZ,
    bridged_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    billsec INTEGER,
    carrier_billsec INTEGER,
    answered BOOLEAN NOT NULL DEFAULT FALSE,
    hangup_cause TEXT,
    hangup_cause_q850 INTEGER,
    sip_hangup_disposition TEXT,
    a_leg_uuid TEXT,
    a_leg_json JSONB,
    b_leg_uuids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    b_legs_json JSONB NOT NULL DEFAULT '[]'::JSONB,
    leg_count INTEGER NOT NULL DEFAULT 0,
    merge_status TEXT NOT NULL DEFAULT 'COLLECTING'
        CHECK (merge_status IN ('COLLECTING', 'READY')),
    cdr_export_status TEXT NOT NULL DEFAULT 'WAITING'
        CONSTRAINT live_call_event_cdr_export_status_check
        CHECK (cdr_export_status IN ('WAITING', 'PENDING', 'COMPLETED', 'ERROR')),
    cdr_export_error TEXT,
    cdr_exported_at TIMESTAMPTZ,
    ingest_count INTEGER NOT NULL DEFAULT 1,
    first_leg_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_leg_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columns needed when this script is applied to the renamed legacy table.
ALTER TABLE live_call_event
    ADD COLUMN IF NOT EXISTS cdr_export_status TEXT NOT NULL DEFAULT 'WAITING',
    ADD COLUMN IF NOT EXISTS cdr_export_error TEXT,
    ADD COLUMN IF NOT EXISTS cdr_exported_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'live_call_event'::regclass
          AND conname = 'live_call_event_cdr_export_status_check'
    ) THEN
        ALTER TABLE live_call_event
            ADD CONSTRAINT live_call_event_cdr_export_status_check
            CHECK (cdr_export_status IN ('WAITING', 'PENDING', 'COMPLETED', 'ERROR'));
    END IF;
END $$;

-- One business/billing record per logical call. Raw JSON remains exclusively
-- in live_call_event; this is the stable input to the rating calculator.
CREATE TABLE IF NOT EXISTS cdr (
    id BIGSERIAL PRIMARY KEY,
    live_call_event_id BIGINT UNIQUE
        REFERENCES live_call_event(id) ON DELETE SET NULL,
    session_uuid TEXT NOT NULL UNIQUE,
    switch_name TEXT,
    customer_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    direction_source TEXT,
    source_ip TEXT,
    source_port INTEGER,
    caller_number TEXT,
    destination_number TEXT,
    route_id TEXT,
    customer_number_id TEXT,
    customer_endpoint_id TEXT,
    carrier_id TEXT,
    carrier_endpoint_id TEXT,
    started_at TIMESTAMPTZ,
    answered_at TIMESTAMPTZ,
    bridged_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    billsec INTEGER NOT NULL DEFAULT 0,
    carrier_billsec INTEGER NOT NULL DEFAULT 0,
    answered BOOLEAN NOT NULL DEFAULT FALSE,
    call_status TEXT NOT NULL,
    hangup_cause TEXT,
    hangup_cause_q850 INTEGER,
    sip_hangup_disposition TEXT,
    leg_count INTEGER NOT NULL DEFAULT 0,
    rating_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (rating_status IN ('PENDING', 'PROCESSING', 'RATED', 'ERROR', 'REVIEW')),
    rated_seconds INTEGER,
    rate_card_id TEXT,
    rate_card_version TEXT,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    sell_rate_per_minute NUMERIC(18, 6),
    carrier_rate_per_minute NUMERIC(18, 6),
    customer_charge NUMERIC(18, 6),
    carrier_cost NUMERIC(18, 6),
    rating_attempts INTEGER NOT NULL DEFAULT 0,
    rating_error TEXT,
    rating_started_at TIMESTAMPTZ,
    rated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Preserve READY records and any rating values from the former combined table.
-- Dynamic SQL keeps the migration safe to rerun after those columns are gone.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'live_call_event'
          AND column_name = 'rating_status'
    ) THEN
        EXECUTE $migration$
            INSERT INTO cdr (
                live_call_event_id, session_uuid, switch_name, customer_id,
                direction, direction_source, source_ip, source_port,
                caller_number, destination_number, route_id, customer_number_id,
                customer_endpoint_id, carrier_id, carrier_endpoint_id,
                started_at, answered_at, bridged_at, ended_at,
                duration_seconds, billsec, carrier_billsec, answered, call_status,
                hangup_cause, hangup_cause_q850, sip_hangup_disposition, leg_count,
                rating_status, rated_seconds, rate_card_id, rate_card_version,
                currency, sell_rate_per_minute, carrier_rate_per_minute,
                customer_charge, carrier_cost, rating_error, rated_at,
                created_at, updated_at
            )
            SELECT
                id, session_uuid, switch_name, customer_id, direction,
                direction_source, source_ip, source_port, caller_number,
                destination_number, route_id, customer_number_id,
                customer_endpoint_id, carrier_id, carrier_endpoint_id,
                started_at, answered_at, bridged_at, ended_at,
                COALESCE(duration_seconds, 0), COALESCE(billsec, 0),
                COALESCE(carrier_billsec, 0), answered,
                CASE
                    WHEN answered THEN 'ANSWERED'
                    WHEN hangup_cause IN ('NO_ANSWER', 'NO_USER_RESPONSE') THEN 'NO_ANSWER'
                    WHEN hangup_cause = 'USER_BUSY' THEN 'BUSY'
                    ELSE 'FAILED'
                END,
                hangup_cause, hangup_cause_q850, sip_hangup_disposition, leg_count,
                CASE WHEN rating_status = 'WAITING' THEN 'PENDING' ELSE rating_status END,
                rated_seconds, rate_card_id, rate_card_version,
                COALESCE(currency, 'USD'), sell_rate_per_minute,
                carrier_rate_per_minute, customer_charge, carrier_cost,
                rating_error, rated_at, created_at, updated_at
            FROM live_call_event
            WHERE merge_status = 'READY'
              AND customer_id IS NOT NULL
              AND direction IS NOT NULL
              AND direction_conflict = FALSE
            ON CONFLICT (session_uuid) DO NOTHING
        $migration$;
    END IF;
END $$;

UPDATE live_call_event AS event
SET cdr_export_status = 'COMPLETED',
    cdr_export_error = NULL,
    cdr_exported_at = COALESCE(event.cdr_exported_at, NOW())
WHERE EXISTS (
    SELECT 1 FROM cdr WHERE cdr.live_call_event_id = event.id
);

-- Legacy READY rows that were not eligible for migration must not remain stuck
-- in WAITING. Valid rows can be picked up by the new worker; ambiguous rows are
-- held for an operator instead of entering billing.
UPDATE live_call_event
SET cdr_export_status = CASE
        WHEN direction_conflict OR direction IS NULL OR customer_id IS NULL THEN 'ERROR'
        ELSE 'PENDING'
    END,
    cdr_export_error = CASE
        WHEN direction_conflict THEN 'Conflicting business direction received across call legs'
        WHEN direction IS NULL THEN 'Business direction could not be determined'
        WHEN customer_id IS NULL THEN 'Customer could not be determined'
        ELSE NULL
    END
WHERE merge_status = 'READY'
  AND cdr_export_status <> 'COMPLETED';

-- Final billing/rating fields no longer belong to the raw event table.
ALTER TABLE live_call_event
    DROP COLUMN IF EXISTS rating_status,
    DROP COLUMN IF EXISTS rated_seconds,
    DROP COLUMN IF EXISTS rate_card_id,
    DROP COLUMN IF EXISTS rate_card_version,
    DROP COLUMN IF EXISTS currency,
    DROP COLUMN IF EXISTS sell_rate_per_minute,
    DROP COLUMN IF EXISTS carrier_rate_per_minute,
    DROP COLUMN IF EXISTS customer_charge,
    DROP COLUMN IF EXISTS carrier_cost,
    DROP COLUMN IF EXISTS rating_error,
    DROP COLUMN IF EXISTS rated_at;

DROP INDEX IF EXISTS cdrs_rating_queue_idx;
DROP INDEX IF EXISTS cdrs_customer_started_idx;
DROP INDEX IF EXISTS cdrs_merge_queue_idx;
DROP INDEX IF EXISTS cdrs_direction_started_idx;

CREATE INDEX IF NOT EXISTS live_call_event_merge_queue_idx
    ON live_call_event (merge_status, last_leg_received_at)
    WHERE merge_status = 'COLLECTING';
CREATE INDEX IF NOT EXISTS live_call_event_export_queue_idx
    ON live_call_event (cdr_export_status, finalized_at, id)
    WHERE merge_status = 'READY' AND cdr_export_status = 'PENDING';
CREATE INDEX IF NOT EXISTS live_call_event_session_idx
    ON live_call_event (session_uuid);

CREATE INDEX IF NOT EXISTS cdr_customer_started_idx
    ON cdr (customer_id, started_at DESC);
CREATE INDEX IF NOT EXISTS cdr_direction_started_idx
    ON cdr (direction, started_at DESC);
CREATE INDEX IF NOT EXISTS cdr_rating_queue_idx
    ON cdr (rating_status, created_at, id)
    WHERE rating_status IN ('PENDING', 'ERROR');
CREATE INDEX IF NOT EXISTS cdr_route_started_idx
    ON cdr (route_id, started_at DESC);
