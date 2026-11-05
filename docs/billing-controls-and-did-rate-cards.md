# Billing controls and DID rate cards

## Deployment

Keep the pending DID-unification migration and this change in order. Back up the switch and subscription databases first. Run `npm run migrate:did-unification` from `bswitchsub`, then `npx prisma migrate deploy` from `billing-switch/backend`. Deploy/restart the subscription service, Nest backend, billing cache API/worker, and frontend together. Refresh the billing cache after the switch migration and before allowing rating to resume. No migration or service restart is performed by editing these files.

## Wallet

`PATCH /api/v1/wallets/:customerId` accepts signed `fiat_delta`, `did_minutes_delta`, and `ob_minutes_delta`, plus a required `reason`. Negative cash changes may create debt; minute quotas cannot become negative. Use `adjustment_type: MRC` or `OTC` only for a cash deduction. These are stored as `mrc`/`otc` transactions and appear in invoice charge lines. `OTHER` remains a balance/quota correction. Existing absolute-balance and positive top-up requests remain supported. The wallet update and its transaction-history row commit together.

The rating worker now writes a signed DID/outbound minute delta on CDR transactions. Invoice remaining-minute reconstruction also accounts for older CDR transactions that only stored `free_minutes_used`.

## Invoices

`POST /api/v1/invoices/preview` and `/generate` accept `skipMrc` and `skipOtc`. Skipping either removes that category from the invoice; usage and optional recording charges are independent. Manual MRC wallet debits are listed when MRC is enabled and the invoice mode is AUTO/HYBRID. The invoice preview and saved `walletSnapshot` include `freeMinutesReport` only if an overlapping assigned plan has a DID-minute allowance. It shows plan included minutes, CDR free minutes consumed in the selected date range, and reconstructed remaining DID minutes at the range end. The same section appears in the dashboard details and printable invoice. TFN and Local DIDs share this allowance.

## Per-DID rate cards

`PATCH /api/v1/customer-numbers/:id/settings` accepts `providerRateCardId` (active CUSTOMER card ID or `null` to inherit). Only a Superadmin may change this field. The DID Override panel keeps destination controls and adds a separate Provider Rate Card section. A change requests a billing cache refresh and returns its status; a failed/skipped refresh leaves the saved mapping intact but the UI reports that the cache needs attention. The rating worker uses this card for an inbound CDR when `customer_number_id` matches; otherwise it uses the existing customer-level card. Carrier cost rating still uses the carrier mapping. Existing CDRs keep their historical rate snapshots and are not repriced.

`customer_number_id` must be exported in the FreeSWITCH XML and arrive in the merged CDR for per-DID rating. Check this field in a test CDR before using per-DID pricing in production.

## Carrier endpoints

The carrier detail route is `/management/carriers/:carrierId`. The page uses the existing carrier and endpoint APIs for create/edit/delete; the former placeholder was caused by a missing frontend route.
