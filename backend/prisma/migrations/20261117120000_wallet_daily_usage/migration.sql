-- Only the short cutoff/trigger installation holds a write-blocking lock.
-- Historical rows are backfilled separately while new rows are summarized live.
BEGIN;

CREATE TABLE wallet_daily_usage (
    customer_id TEXT NOT NULL,
    usage_date DATE NOT NULL,
    currency VARCHAR(10) NOT NULL,
    call_count INTEGER NOT NULL DEFAULT 0,
    recording_batches INTEGER NOT NULL DEFAULT 0,
    free_minutes_used INTEGER NOT NULL DEFAULT 0,
    call_charge NUMERIC(18, 6) NOT NULL DEFAULT 0,
    recording_charge NUMERIC(18, 6) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT wallet_daily_usage_pkey PRIMARY KEY (customer_id, usage_date, currency)
);

CREATE INDEX wallet_daily_usage_customer_date_idx
    ON wallet_daily_usage (customer_id, usage_date DESC);

CREATE TABLE wallet_daily_usage_rollout (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    cutoff_id BIGINT NOT NULL,
    backfilled BOOLEAN NOT NULL DEFAULT FALSE
);

LOCK TABLE transactions IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO wallet_daily_usage_rollout (singleton, cutoff_id)
SELECT TRUE, COALESCE(MAX(id), 0) FROM transactions;

CREATE FUNCTION update_wallet_daily_usage() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO wallet_daily_usage (
        customer_id, usage_date, currency, call_count, recording_batches,
        free_minutes_used, call_charge, recording_charge
    )
    SELECT
        tx.customer_id, (tx.created_at AT TIME ZONE 'UTC')::date, tx.currency,
        COUNT(*) FILTER (WHERE tx.source_type = 'cdr')::integer,
        COUNT(*) FILTER (WHERE tx.source_type = 'recording')::integer,
        COALESCE(SUM(tx.free_minutes_used) FILTER (WHERE tx.source_type = 'cdr'), 0)::integer,
        COALESCE(SUM(tx.fiat_debit_amount) FILTER (WHERE tx.source_type = 'cdr'), 0),
        COALESCE(SUM(tx.fiat_debit_amount) FILTER (WHERE tx.source_type = 'recording'), 0)
    FROM inserted_transactions AS tx
    CROSS JOIN wallet_daily_usage_rollout AS rollout
    WHERE tx.id > rollout.cutoff_id
      AND tx.status = 'posted'
      AND tx.source_type IN ('cdr', 'recording')
    GROUP BY tx.customer_id, (tx.created_at AT TIME ZONE 'UTC')::date, tx.currency
    ON CONFLICT (customer_id, usage_date, currency) DO UPDATE SET
        call_count = wallet_daily_usage.call_count + EXCLUDED.call_count,
        recording_batches = wallet_daily_usage.recording_batches + EXCLUDED.recording_batches,
        free_minutes_used = wallet_daily_usage.free_minutes_used + EXCLUDED.free_minutes_used,
        call_charge = wallet_daily_usage.call_charge + EXCLUDED.call_charge,
        recording_charge = wallet_daily_usage.recording_charge + EXCLUDED.recording_charge,
        updated_at = NOW();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_wallet_daily_usage_insert
AFTER INSERT ON transactions
REFERENCING NEW TABLE AS inserted_transactions
FOR EACH STATEMENT EXECUTE FUNCTION update_wallet_daily_usage();

COMMIT;

-- This backfill is additive but disjoint from the trigger (id <= cutoff_id).
-- It commits atomically with the backfilled flag, making a retry safe.
BEGIN;
WITH pending AS (
    SELECT cutoff_id FROM wallet_daily_usage_rollout
    WHERE singleton = TRUE AND backfilled = FALSE
    FOR UPDATE
)
INSERT INTO wallet_daily_usage (
    customer_id, usage_date, currency, call_count, recording_batches,
    free_minutes_used, call_charge, recording_charge
)
SELECT
    tx.customer_id, (tx.created_at AT TIME ZONE 'UTC')::date, tx.currency,
    COUNT(*) FILTER (WHERE tx.source_type = 'cdr')::integer,
    COUNT(*) FILTER (WHERE tx.source_type = 'recording')::integer,
    COALESCE(SUM(tx.free_minutes_used) FILTER (WHERE tx.source_type = 'cdr'), 0)::integer,
    COALESCE(SUM(tx.fiat_debit_amount) FILTER (WHERE tx.source_type = 'cdr'), 0),
    COALESCE(SUM(tx.fiat_debit_amount) FILTER (WHERE tx.source_type = 'recording'), 0)
FROM transactions AS tx
CROSS JOIN pending
WHERE tx.id <= pending.cutoff_id
  AND tx.status = 'posted'
  AND tx.source_type IN ('cdr', 'recording')
GROUP BY tx.customer_id, (tx.created_at AT TIME ZONE 'UTC')::date, tx.currency
ON CONFLICT (customer_id, usage_date, currency) DO UPDATE SET
    call_count = wallet_daily_usage.call_count + EXCLUDED.call_count,
    recording_batches = wallet_daily_usage.recording_batches + EXCLUDED.recording_batches,
    free_minutes_used = wallet_daily_usage.free_minutes_used + EXCLUDED.free_minutes_used,
    call_charge = wallet_daily_usage.call_charge + EXCLUDED.call_charge,
    recording_charge = wallet_daily_usage.recording_charge + EXCLUDED.recording_charge,
    updated_at = NOW();

UPDATE wallet_daily_usage_rollout SET backfilled = TRUE WHERE singleton = TRUE;
COMMIT;
