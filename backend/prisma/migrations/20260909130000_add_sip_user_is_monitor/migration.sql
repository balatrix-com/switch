ALTER TABLE "sip_users" ADD COLUMN IF NOT EXISTS "is_monitor" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "sip_users_customer_id_is_monitor_idx" ON "sip_users"("customer_id", "is_monitor");
