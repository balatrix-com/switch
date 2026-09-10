ALTER TABLE "customers" ADD COLUMN "extension_limit" INTEGER NOT NULL DEFAULT 10;

CREATE TABLE "sip_users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "username" TEXT NOT NULL,
  "secret_hash" TEXT NOT NULL,
  "sip_profile" TEXT NOT NULL DEFAULT 'internal',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "customer_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sip_users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sip_users_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sip_users_username_key" ON "sip_users"("username");
CREATE INDEX "sip_users_customer_id_is_active_idx" ON "sip_users"("customer_id", "is_active");
