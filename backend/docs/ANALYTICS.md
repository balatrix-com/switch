# Call analytics

`GET /api/v1/analytics?from=2026-11-12T00:00:00.000Z&to=2026-11-13T00:00:00.000Z&direction=INBOUND`

Requires a bearer token for `SUPER_ADMIN` or `CUSTOMER`. The `from` boundary is inclusive and `to` is exclusive. `direction` may be `INBOUND` or `OUTBOUND`; omit it for both. The maximum range is 366 days. If omitted, the API uses the preceding seven 24-hour periods. SuperAdmins may optionally filter by `customerId`; customer users are always scoped to the customer ID in their JWT, and a conflicting `customerId` is rejected.

All figures come from the finalized `cdr` table: one row per logical call. `live_call_event` and Homer SIP packets are not counted. Calculations are performed by bounded PostgreSQL aggregate queries, not by downloading CDR rows to the browser.

- Total calls: `COUNT(*)`.
- Answered: `COUNT(*) FILTER (WHERE answered)`.
- No answer: unanswered rows with `call_status` of `NO_ANSWER` or `NO_USER_RESPONSE`.
- Busy: unanswered rows with `call_status = 'BUSY'`.
- Failed: other unanswered rows.
- ASR: `answered / total * 100`, or zero when total is zero.
- ACD: `SUM(GREATEST(billsec, 0)) / answered` seconds, or zero when answered is zero.
- Minutes: actual `billsec / 60`, not rounded/rated minutes.
- Customer revenue/spend: sum of populated `customer_charge`.
- Carrier cost: sum of populated `carrier_cost` only where `carrier_currency` is null or matches the customer CDR currency.
- Margin: revenue minus comparable carrier cost. It is withheld when a carrier cost has a different currency; no FX conversion is assumed.

The response includes `range`, `summary`, `money` (one entry per currency), `series` (UTC daily counts, including zero-call days), `dids` (inbound-only ranking), and, for SuperAdmins, `tenants` and `carriers`. DID ranking follows the assigned number ID to the global inventory canonical number; it falls back to the CDR destination number if the assignment is no longer present. DID ranking remains inbound-only regardless of the headline direction filter.

Tenant responses omit carrier cost, margin, and platform-wide breakdowns at the API layer. The frontend page is `/analytics`. CSV export includes the returned aggregate rows and daily series; it does not export raw CDRs.

Deploy the new Prisma migration with `npm run prisma:deploy` from `backend/` after ensuring the CDR table exists. The same indexes are also declared in `cdr-service/schema.sql` for installations that create the CDR table after Prisma migrations. No new analytics tables are required.
