# Billing engine

This service is deliberately separate from the routing API. It caches rate-card configuration and rates each finalized `cdr` once for both sides of the call:

- customer sell rate and customer minimum-billing pulse;
- carrier/vendor cost rate and carrier minimum-billing pulse.

Each card contains one flat inbound rate and one flat outbound rate. The CDR direction selects the rate; destinations and prefixes are not used for billing.

The initial pulse and subsequent pulse are applied independently. For a 37-second call, customer 30/6 bills 42 seconds while vendor 60/60 bills 60 seconds.

## Processes

Copy `.env.example` to `.env`, export it before launch, and install `requirements.txt` in a virtual environment. Run two independent PM2 processes from this directory:

```bash
pm2 start api_server.py --name billing-cache-api --interpreter /opt/switch/billing-engine/.venv/bin/python
pm2 start billing_worker.py --name billing-rating-worker --interpreter /opt/switch/billing-engine/.venv/bin/python
pm2 save
```

The Nest backend calls `http://127.0.0.1:9100/api/v1/cache/refresh` after rate-card or mapping mutations. The worker reloads the atomic cache file when its modification time changes and claims CDRs with `FOR UPDATE SKIP LOCKED`, so multiple workers do not rate the same row concurrently.

Set the same `BILLING_CACHE_PATH` for the cache API and rating worker. A relative path such as `./cache/billing_cache.json` is resolved from the `billing-engine` directory, independent of the PM2 working directory. Saving a DID with a provider rate card refreshes this cache even when the selected card has not changed; inspect the DID update response's `cacheRefresh` field for `success`, `skipped`, or `error`.

If a CDR reached `BILLING_RETRY_LIMIT` while the cache was stale, refresh the cache first and confirm that its `numberRateCards` contains the CDR's `customer_number_id`. Then inspect that CDR and any existing settlement/transaction before requeuing that specific failed record. Do not reset every ERROR CDR indiscriminately.

## Wallet daily usage summary

Deploy the backend Prisma migrations before deploying the wallet API/frontend. The first migration creates `wallet_daily_usage`, installs a statement-level transaction trigger, and backfills older posted call/recording transactions. It takes a short write lock only while capturing the legacy transaction ID cutoff and installing the trigger; the historical scan runs afterward. The second migration adds a concurrent partial index so the wallet API can count non-usage entries without scanning call rows. Run `npx prisma migrate deploy` from `backend` during a quiet period and check that `wallet_daily_usage_rollout.backfilled` is `true` before exposing the new UI.

Each newly inserted batch of `cdr` or `recording` transactions updates its daily UTC bucket in the same database transaction. The wallet page reads one bucket per customer/day/currency instead of aggregating every call on each refresh. The original `transactions` rows remain available through the detailed ledger and for invoices. The `recording_batches` field counts wallet recording transactions, not individual recorded calls.

For a nightly safety check, install the example `systemd/wallet-daily-reconcile.service` and `.timer` on the billing server (adjust `/opt/switch/billing-engine` if deployed elsewhere), then enable the timer. It rechecks yesterday's UTC buckets against the source transactions, one customer at a time, without pausing the rating worker. For a one-off check of a particular day:

```bash
/opt/switch/billing-engine/.venv/bin/python /opt/switch/billing-engine/reconcile_wallet_daily_usage.py --date 2026-11-17
```

Check one day's totals after deployment:

```sql
SELECT customer_id, usage_date, currency, call_count, recording_batches,
       call_charge, recording_charge
FROM wallet_daily_usage
ORDER BY usage_date DESC, customer_id
LIMIT 20;
```
