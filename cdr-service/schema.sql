CREATE TABLE IF NOT EXISTS cdrs (
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
    rating_status TEXT NOT NULL DEFAULT 'WAITING'
        CHECK (rating_status IN ('WAITING', 'PENDING', 'PROCESSING', 'RATED', 'ERROR', 'REVIEW')),
    rated_seconds INTEGER,
    rate_card_id TEXT,
    rate_card_version TEXT,
    currency VARCHAR(3),
    sell_rate_per_minute NUMERIC(18, 6),
    carrier_rate_per_minute NUMERIC(18, 6),
    customer_charge NUMERIC(18, 6),
    carrier_cost NUMERIC(18, 6),
    rating_error TEXT,
    rated_at TIMESTAMPTZ,
    ingest_count INTEGER NOT NULL DEFAULT 1,
    first_leg_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_leg_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cdrs_customer_started_idx
    ON cdrs (customer_id, started_at DESC);
CREATE INDEX IF NOT EXISTS cdrs_rating_queue_idx
    ON cdrs (rating_status, finalized_at)
    WHERE rating_status IN ('PENDING', 'ERROR');
CREATE INDEX IF NOT EXISTS cdrs_merge_queue_idx
    ON cdrs (merge_status, last_leg_received_at)
    WHERE merge_status = 'COLLECTING';
CREATE INDEX IF NOT EXISTS cdrs_direction_started_idx
    ON cdrs (direction, started_at DESC);

