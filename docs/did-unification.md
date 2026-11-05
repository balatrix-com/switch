# DID category and subtypes

All customer-owned inbound numbers have category `DID`. `TFN` (toll-free) and `LOCAL` are DID subtypes. Asset plans may reserve separate subtype slot counts, but both subtypes consume the same `did_free_minutes` wallet allowance and the same inbound DID sell rate. Outbound minutes remain in the `OB` bucket.

Legacy `tfn_free_minutes` columns remain at zero temporarily for compatibility with old readers. They are not a second allowance. Existing TFN and DID wallet minutes are summed into DID by the migrations; existing TFN inventory/asset rows become DID with subtype TFN. Do not run the new application code before both database migrations.

Deployment order (after database backups, during a maintenance window):

1. From `bswitchsub`, run `npm run migrate:did-unification` against the subscription database.
2. From `billing-switch/backend`, run `npx prisma migrate deploy` against the switch database. This also applies any earlier pending Prisma migrations.
3. Deploy/restart `bswitchsub`, the billing-switch backend, frontend, and billing rating worker together.
4. Confirm an existing TFN inventory row is now `number_type=DID, number_subtype=TFN`; confirm a Local row is `DID/LOCAL`.
5. Confirm old TFN and DID balances were merged into `did_free_minutes` (and legacy TFN balances are zero) in both wallet tables.
6. Create one asset plan with TFN and Local slots and shared DID minutes; assign one of each subtype; make an inbound test call to each and verify both deduct the DID wallet bucket.

The migration scripts do not drop legacy columns. Do not manually rerun a failed partial deployment without checking transaction status and service versions.
