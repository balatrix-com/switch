-- Replace destination-prefix items with the flat inbound/outbound rate-card
-- structure used by the existing white-label billing engine.
ALTER TABLE "rate_cards"
  ADD COLUMN "inbound_rate_per_minute" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "inbound_initial_increment_seconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "inbound_increment_seconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "outbound_rate_per_minute" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "outbound_initial_increment_seconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "outbound_increment_seconds" INTEGER NOT NULL DEFAULT 60;

-- Copy one representative rate when upgrading a database that already has
-- prefix items. A catch-all rate is preferred; otherwise the lowest-priority
-- active row is used. The original rows are archived below for rollback/audit.
UPDATE "rate_cards" AS card
SET "inbound_rate_per_minute" = COALESCE((
      SELECT item."rate_per_minute"
      FROM "rate_card_items" AS item
      WHERE item."rate_card_id" = card."id"
        AND item."direction" = 'INBOUND'
        AND item."is_active" = true
      ORDER BY CASE WHEN item."prefix" = '*' THEN 0 ELSE 1 END, item."priority", item."created_at"
      LIMIT 1
    ), 0),
    "outbound_rate_per_minute" = COALESCE((
      SELECT item."rate_per_minute"
      FROM "rate_card_items" AS item
      WHERE item."rate_card_id" = card."id"
        AND item."direction" = 'OUTBOUND'
        AND item."is_active" = true
      ORDER BY CASE WHEN item."prefix" = '*' THEN 0 ELSE 1 END, item."priority", item."created_at"
      LIMIT 1
    ), 0);

-- Preserve the former default minimum profile as both direction defaults.
UPDATE "rate_cards" AS card
SET "inbound_initial_increment_seconds" = minimum."initial_increment_seconds",
    "inbound_increment_seconds" = minimum."increment_seconds",
    "outbound_initial_increment_seconds" = minimum."initial_increment_seconds",
    "outbound_increment_seconds" = minimum."increment_seconds"
FROM "minimum_billing_settings" AS minimum
WHERE card."default_minimum_billing_setting_id" = minimum."id";

ALTER TABLE "rate_cards"
  ADD CONSTRAINT "rate_cards_inbound_rate_nonnegative" CHECK ("inbound_rate_per_minute" >= 0),
  ADD CONSTRAINT "rate_cards_outbound_rate_nonnegative" CHECK ("outbound_rate_per_minute" >= 0),
  ADD CONSTRAINT "rate_cards_inbound_initial_positive" CHECK ("inbound_initial_increment_seconds" > 0),
  ADD CONSTRAINT "rate_cards_inbound_increment_positive" CHECK ("inbound_increment_seconds" > 0),
  ADD CONSTRAINT "rate_cards_outbound_initial_positive" CHECK ("outbound_initial_increment_seconds" > 0),
  ADD CONSTRAINT "rate_cards_outbound_increment_positive" CHECK ("outbound_increment_seconds" > 0);

-- Keep the former rate items and default-minimum reference as legacy data.
-- Prisma ignores these database-only objects, while the billing runtime uses
-- only the six flat rate/pulse columns added above.
ALTER TABLE "rate_card_items" RENAME TO "legacy_rate_card_items";
