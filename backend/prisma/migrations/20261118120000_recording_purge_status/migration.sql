-- Keep billing history. Only the recording file is removed by the daily job.
ALTER TABLE rec
    ADD COLUMN purge_status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN purged_at TIMESTAMPTZ,
    ADD COLUMN purge_attempted_at TIMESTAMPTZ,
    ADD COLUMN purge_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN purge_error TEXT,
    ADD COLUMN purged_bytes BIGINT NOT NULL DEFAULT 0;

