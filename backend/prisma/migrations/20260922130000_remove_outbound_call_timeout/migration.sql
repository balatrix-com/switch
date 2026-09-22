ALTER TABLE "carriers"
DROP COLUMN IF EXISTS "default_call_timeout_seconds";

ALTER TABLE "switch_routes"
DROP COLUMN IF EXISTS "call_timeout_seconds";
