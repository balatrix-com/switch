ALTER TABLE "global_number_inventory"
  ADD COLUMN "manually_disabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "subscription_disabled" BOOLEAN NOT NULL DEFAULT false;

-- Preserve legacy suspended DIDs as admin-disabled until an operator reviews them.
UPDATE "global_number_inventory" AS inventory
SET "manually_disabled" = true
WHERE inventory."status" = 'SUSPENDED'
   OR EXISTS (
     SELECT 1 FROM "customer_numbers" AS assignment
     WHERE assignment."inventory_id" = inventory."id"
       AND assignment."status" = 'SUSPENDED'
   );
