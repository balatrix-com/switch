CREATE TYPE "RateCardType" AS ENUM ('CUSTOMER', 'VENDOR');
CREATE TYPE "BillingParty" AS ENUM ('CUSTOMER', 'VENDOR');

CREATE TABLE "minimum_billing_settings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "party" "BillingParty" NOT NULL,
    "initial_increment_seconds" INTEGER NOT NULL DEFAULT 60,
    "increment_seconds" INTEGER NOT NULL DEFAULT 60,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "minimum_billing_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "minimum_billing_initial_positive" CHECK ("initial_increment_seconds" > 0),
    CONSTRAINT "minimum_billing_increment_positive" CHECK ("increment_seconds" > 0)
);

CREATE TABLE "rate_cards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RateCardType" NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "default_minimum_billing_setting_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rate_cards_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "rate_card_items" (
    "id" TEXT NOT NULL,
    "rate_card_id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "description" TEXT,
    "direction" "RouteDirection" NOT NULL,
    "rate_per_minute" DECIMAL(18,6) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rate_card_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rate_card_item_rate_nonnegative" CHECK ("rate_per_minute" >= 0),
    CONSTRAINT "rate_card_item_window" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE TABLE "customer_rate_cards" (
    "customer_id" TEXT NOT NULL,
    "rate_card_id" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_rate_cards_pkey" PRIMARY KEY ("customer_id"),
    CONSTRAINT "customer_rate_card_window" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE TABLE "carrier_rate_cards" (
    "carrier_id" TEXT NOT NULL,
    "rate_card_id" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "carrier_rate_cards_pkey" PRIMARY KEY ("carrier_id"),
    CONSTRAINT "carrier_rate_card_window" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE TABLE "customer_minimum_billing" (
    "customer_id" TEXT NOT NULL,
    "setting_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_minimum_billing_pkey" PRIMARY KEY ("customer_id")
);

CREATE TABLE "carrier_minimum_billing" (
    "carrier_id" TEXT NOT NULL,
    "setting_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "carrier_minimum_billing_pkey" PRIMARY KEY ("carrier_id")
);

CREATE UNIQUE INDEX "rate_cards_type_name_key" ON "rate_cards"("type", "name");
CREATE INDEX "rate_cards_type_is_active_idx" ON "rate_cards"("type", "is_active");
CREATE UNIQUE INDEX "rate_card_items_card_direction_prefix_key" ON "rate_card_items"("rate_card_id", "direction", "prefix");
CREATE INDEX "rate_card_items_lookup_idx" ON "rate_card_items"("rate_card_id", "direction", "is_active", "priority");
CREATE INDEX "rate_card_items_prefix_idx" ON "rate_card_items"("prefix");
CREATE INDEX "customer_rate_cards_rate_card_id_idx" ON "customer_rate_cards"("rate_card_id");
CREATE INDEX "carrier_rate_cards_rate_card_id_idx" ON "carrier_rate_cards"("rate_card_id");
CREATE UNIQUE INDEX "minimum_billing_settings_party_name_key" ON "minimum_billing_settings"("party", "name");
CREATE INDEX "minimum_billing_settings_party_active_idx" ON "minimum_billing_settings"("party", "is_active");
CREATE INDEX "customer_minimum_billing_setting_id_idx" ON "customer_minimum_billing"("setting_id");
CREATE INDEX "carrier_minimum_billing_setting_id_idx" ON "carrier_minimum_billing"("setting_id");

ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_default_minimum_fkey" FOREIGN KEY ("default_minimum_billing_setting_id") REFERENCES "minimum_billing_settings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rate_card_items" ADD CONSTRAINT "rate_card_items_rate_card_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_rate_cards" ADD CONSTRAINT "customer_rate_cards_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_rate_cards" ADD CONSTRAINT "customer_rate_cards_rate_card_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "carrier_rate_cards" ADD CONSTRAINT "carrier_rate_cards_carrier_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "carrier_rate_cards" ADD CONSTRAINT "carrier_rate_cards_rate_card_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "rate_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_minimum_billing" ADD CONSTRAINT "customer_minimum_billing_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_minimum_billing" ADD CONSTRAINT "customer_minimum_billing_setting_fkey" FOREIGN KEY ("setting_id") REFERENCES "minimum_billing_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "carrier_minimum_billing" ADD CONSTRAINT "carrier_minimum_billing_carrier_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "carrier_minimum_billing" ADD CONSTRAINT "carrier_minimum_billing_setting_fkey" FOREIGN KEY ("setting_id") REFERENCES "minimum_billing_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The CDR table is owned by cdr-service, so these columns are additive only.
ALTER TABLE IF EXISTS "cdr"
  ADD COLUMN IF NOT EXISTS "carrier_rate_card_id" TEXT,
  ADD COLUMN IF NOT EXISTS "carrier_rate_card_version" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_minimum_billing_id" TEXT,
  ADD COLUMN IF NOT EXISTS "carrier_minimum_billing_id" TEXT,
  ADD COLUMN IF NOT EXISTS "carrier_rated_seconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "customer_initial_increment_seconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "carrier_initial_increment_seconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "customer_billing_increment_seconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "carrier_billing_increment_seconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "carrier_currency" VARCHAR(3);
