CREATE TABLE "customer_sip_traces" (
    "id" BIGSERIAL NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_number_id" TEXT,
    "cdr_id" BIGINT NOT NULL,
    "session_uuid" TEXT NOT NULL,
    "call_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "correlation_id" TEXT,
    "direction" TEXT NOT NULL,
    "caller_number" TEXT,
    "called_number" TEXT,
    "customer_number" TEXT,
    "status" TEXT NOT NULL,
    "response_code" INTEGER,
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "source_ip" TEXT,
    "destination_ip" TEXT,
    "capture_id" INTEGER NOT NULL DEFAULT 61,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "participants" JSONB,
    "messages_snapshot" JSONB,
    "synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sip_traces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_sip_traces_customer_id_fkey"
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_sip_traces_customer_number_id_fkey"
        FOREIGN KEY ("customer_number_id") REFERENCES "customer_numbers"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "customer_sip_traces_cdr_id_key"
    ON "customer_sip_traces"("cdr_id");
CREATE UNIQUE INDEX "customer_sip_traces_session_uuid_key"
    ON "customer_sip_traces"("session_uuid");
CREATE INDEX "customer_sip_traces_customer_id_started_at_idx"
    ON "customer_sip_traces"("customer_id", "started_at" DESC);
CREATE INDEX "customer_sip_traces_customer_number_id_started_at_idx"
    ON "customer_sip_traces"("customer_number_id", "started_at" DESC);
