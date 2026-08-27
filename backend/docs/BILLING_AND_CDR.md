# Billing, rate cards, and CDR API

The routing API stores billing configuration. The separate `billing-engine` builds a runtime cache and rates finalized rows from the singular `cdr` table. It never reads raw FreeSWITCH JSON from `live_call_event`.

## Minimum-billing calculation

Minimum billing is a pulse, not a monthly minimum fee. For actual answered seconds `s`, initial block `i`, and later increment `p`:

```text
s = 0      -> 0 billed seconds
0 < s <= i -> i billed seconds
s > i      -> i + ceil((s - i) / p) * p
charge     -> rate_per_minute / 60 * billed_seconds
```

Customer and carrier seconds are calculated independently. A 37-second call with customer 30/6 and carrier 60/60 produces 42 customer-rated seconds and 60 carrier-rated seconds.

## Flat rate cards

Rates are entered directly in the frontend. Each customer sell or carrier cost card stores exactly two direction rates:

- inbound rate per minute, inbound initial seconds, and inbound next pulse;
- outbound rate per minute, outbound initial seconds, and outbound next pulse.

There is no destination-prefix lookup and no CSV upload. The final CDR direction selects the inbound or outbound values from the mapped card. A customer/carrier minimum profile is optional and overrides the card's direction-specific pulse when present.

The flat-rate migration keeps any former prefix rows in the database table `legacy_rate_card_items` for audit or rollback. Neither the API nor the billing engine reads that legacy table.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/api/v1/rate-cards` | List or create customer/vendor rate cards |
| GET / PATCH / DELETE | `/api/v1/rate-cards/:id` | Inspect or manage one rate card |
| GET / PUT / DELETE | `/api/v1/rate-card-mappings/customers/:customerId` | Customer sell-card mapping (GET lists at `/customers`) |
| GET / PUT / DELETE | `/api/v1/rate-card-mappings/carriers/:carrierId` | Carrier cost-card mapping (GET lists at `/carriers`) |
| GET / POST | `/api/v1/minimum-billing/settings` | List/create reusable pulse profiles |
| PATCH / DELETE | `/api/v1/minimum-billing/settings/:id` | Manage a pulse profile |
| GET | `/api/v1/minimum-billing/mappings` | List customer and carrier overrides |
| PUT / DELETE | `/api/v1/minimum-billing/customers/:customerId` | Set/remove customer pulse override |
| PUT / DELETE | `/api/v1/minimum-billing/carriers/:carrierId` | Set/remove carrier pulse override |
| POST | `/api/v1/billing/cache/refresh` | Manually request an engine cache refresh |
| GET | `/api/v1/cdrs` | Paginated CDRs with filters |
| GET | `/api/v1/cdrs/:id` | Full final CDR and billing snapshots |

Every configuration mutation commits to PostgreSQL first and then requests the cache refresh. The response has this envelope:

```json
{
  "data": {},
  "cacheRefresh": {
    "status": "success",
    "message": "Billing engine cache refreshed"
  }
}
```

If the cache service is down, the database write remains committed and `cacheRefresh.status` is `error`; the frontend displays that condition. Retry with `POST /api/v1/billing/cache/refresh` after the engine is available.

CDR filters: `page`, `pageSize`, `customerId`, `direction`, `ratingStatus`, `search`, `from`, and `to`. Swagger at `/api/docs` contains the generated request schemas.
