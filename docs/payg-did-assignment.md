# Pay-as-you-go DID assignment

Customers created with **Skip Subscription** need no asset plan, minute pack, or plan setup fee. The switch still requires the DID/TFN to exist in global inventory before assignment.

When an inventory number is assigned, `billing-switch` calls `bswitchsub /number_assigning`. `bswitchsub` atomically claims an available slot from an active asset subscription matching DID subtype (TFN or LOCAL); when none exists, it inserts an assigned `ON_DEMAND` slot. A plan-backed slot returns to `available` on unassign. An `ON_DEMAND` row is deleted. The switch releases the remote asset before removing its local assignment, and attempts to restore the remote asset if its local transaction fails.

The on-demand slot does not include free minutes or charge OTC/MRC automatically. Set the customer's sell rate card (or a DID-level card) and the carrier cost card before rating calls. If the customer already has a valid default destination, assignment generates the DID XML immediately. Otherwise, the assignment succeeds with `xmlStatus: PENDING_CONFIGURATION`; configure the customer's endpoint/DID destination and generate XML from DID Override before placing inbound calls. Manual MRC and OTC can be entered in invoices or as classified wallet deductions.

## Deployment order

1. Back up the subscription and switch databases. Check for duplicate assigned numbers in `bswitchsub`: `SELECT number, count(*) FROM number_assets WHERE number IS NOT NULL AND status = 'assigned' GROUP BY number HAVING count(*) > 1;`. Resolve duplicates before migration; the new unique index will reject them.
2. If not already applied, run `npm run migrate:did-unification` from `bswitchsub` first.
3. Run `npm run migrate:on-demand-assets` from `bswitchsub` to add `provisioning_mode` and the assigned-number uniqueness index.
4. Deploy/restart `bswitchsub` and the `billing-switch` backend together. No Prisma schema change is required specifically for this feature; apply any existing pending Prisma migrations according to the DID-unification guide.
5. Create a Skip Subscription customer, map customer/DID and carrier rate cards, assign one Local DID and one TFN from inventory, and verify `number_assets.provisioning_mode = 'ON_DEMAND'` for both. Configure destinations and make inbound test calls. Unassign and verify both rows are gone.

If `bswitchsub` is unavailable during unassign, the switch retains its local assignment and returns an error instead of leaving a remote orphan. A failed cross-service compensation after a switch database failure is logged and requires manual reconciliation.
