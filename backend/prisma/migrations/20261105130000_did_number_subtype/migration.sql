ALTER TABLE "global_number_inventory" ADD COLUMN "number_subtype" TEXT NOT NULL DEFAULT 'LOCAL';
UPDATE "global_number_inventory"
SET "number_subtype" = CASE WHEN UPPER("number_type") = 'TFN' THEN 'TFN' ELSE 'LOCAL' END,
    "number_type" = 'DID';
ALTER TABLE "global_number_inventory" ADD CONSTRAINT "global_number_inventory_did_category_check"
  CHECK ("number_type" = 'DID' AND "number_subtype" IN ('TFN', 'LOCAL'));
CREATE INDEX "global_number_inventory_number_subtype_idx" ON "global_number_inventory"("number_subtype");

-- Preserve purchased TFN minutes while retiring the separate inbound TFN pool.
UPDATE "customer_wallets"
SET "did_free_minutes" = "did_free_minutes" + "tfn_free_minutes",
    "tfn_free_minutes" = 0,
    "version" = "version" + 1
WHERE "tfn_free_minutes" > 0;
ALTER TABLE "customer_wallets" ADD CONSTRAINT "customer_wallets_single_did_minute_pool_check"
  CHECK ("tfn_free_minutes" = 0);
