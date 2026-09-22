# FreeSWITCH CDR pipeline

This directory contains two deliberately separate processes:

1. `cdr_server.py` receives `mod_json_cdr` HTTP documents on port `9000`,
   correlates the A-leg and B-leg attempts, and stores raw data in
   `live_call_event`.
2. `livecall_to_cdr.worker` promotes a merged `READY` event to the final `cdr`
   table. The billing/rating application reads and updates only `cdr`.

The routing API, FreeSWITCH XML CURL service, CDR collector, promotion worker,
and future rating calculator remain independent components.

## Tables and lifecycle

`live_call_event` contains raw JSON and merge state only. It has no rate-card,
currency, charge, carrier-cost, or rating columns.

```text
FreeSWITCH A/B JSON
  -> live_call_event (COLLECTING / WAITING)
  -> live_call_event (READY / PENDING)
  -> livecall_to_cdr worker
  -> live_call_event (READY / COMPLETED)
  -> cdr (rating_status=PENDING)
  -> separate rating calculator
  -> cdr (RATED, ERROR, or REVIEW)
```

The operational `cdr_export_status` on the raw table is not billing state. It
only prevents repeated promotion and records whether the raw row was copied.

For recording visibility, the dialplan exports
`billing_recording_requested=true` only when recording is enabled for the call.
The collector preserves that flag on `live_call_event`, and promotion stores
`cdr.has_recording = recording_requested AND answered`. This is deliberately a
lightweight indication that FreeSWITCH attempted recording for an answered call;
it does not perform a recording-file existence check.

The schema migration is data-preserving:

- an existing `cdrs` table is renamed to `live_call_event`;
- existing valid `READY` rows are copied into `cdr`;
- billing/rating columns are removed from `live_call_event` only after that;
- applying `schema.sql` again is safe.

If a genuinely new leg arrives after promotion, the raw row re-enters
`COLLECTING`. On its next promotion, the existing CDR is updated. A previously
`RATED` CDR becomes `REVIEW` and retains its old amounts for audit; it is never
silently charged again.

## Direction and leg correlation

FreeSWITCH `channel_data.direction` describes an individual channel leg, not
the customer-facing business direction. The collector determines direction in
this order:

1. `variables.billing_direction`;
2. `variables.sip_h_X-Call-Direction`, supplied by Kamailio;
3. original source IP in `source_ip_auth` (`CUSTOMER` means `OUTBOUND`,
   `CARRIER` means `INBOUND`).

A B-leg is correlated through `billing_session_id`,
`originating_leg_uuid`/`originator`, `call_uuid`, or `signal_bond`. Legs may
arrive in either order. Replayed leg UUIDs increase `ingest_count` but do not
create duplicate legs or duplicate CDRs.

After no new leg has arrived for `MERGE_WAIT_SECONDS`, an A-leg-owned call
becomes `READY`. Missing customer/direction or conflicting direction produces
`cdr_export_status=ERROR`, so the worker cannot send ambiguous data to billing.

## Install and database migration

No Prisma command is needed for these two service-owned tables. The Python
processes apply `schema.sql` when `AUTO_CREATE_SCHEMA=true`. You can also apply
it explicitly:

```bash
cd /opt/switch/cdr-service
. .venv/bin/activate
pip install -r requirements.txt
psql "$DATABASE_URL" -f schema.sql
```

For the Prisma-style URL containing `?schema=public`, either let the service run
the migration or remove that query parameter for the `psql` command.

## Run locally

```bash
cd /opt/switch/cdr-service
cp .env.example .env
. .venv/bin/activate
python cdr_server.py
```

In another shell:

```bash
cd /opt/switch/cdr-service
. .venv/bin/activate
python -m livecall_to_cdr.worker
```

Check the collector and post a saved CDR:

```bash
curl http://127.0.0.1:9000/health
curl -u freeswitch:change-me \
  -H 'Content-Type: application/json' \
  --data-binary @/var/log/freeswitch/json_cdr/example.cdr.json \
  http://127.0.0.1:9000/cdr
```

## PM2

Run both processes from the same virtual environment:

```bash
cd /opt/switch/cdr-service
pm2 start cdr_server.py \
  --name billing-cdr-collector \
  --interpreter /opt/switch/cdr-service/.venv/bin/python

pm2 start livecall_to_cdr/worker.py \
  --name livecall-to-cdr \
  --cwd /opt/switch/cdr-service \
  --interpreter /opt/switch/cdr-service/.venv/bin/python

pm2 save
pm2 status
pm2 logs billing-cdr-collector
pm2 logs livecall-to-cdr
```

The collector and worker both read `/opt/switch/cdr-service/.env`.

## Rating worker contract

The later billing calculator must claim only final CDR rows:

```sql
SELECT *
FROM cdr
WHERE rating_status = 'PENDING'
ORDER BY created_at, id
FOR UPDATE SKIP LOCKED;
```

It should atomically move `PENDING -> PROCESSING -> RATED` or `ERROR`. Monetary
values are `NUMERIC(18,6)`; do not calculate them with binary floating point.

## Useful checks

```sql
SELECT id, session_uuid, merge_status, cdr_export_status, leg_count
FROM live_call_event
ORDER BY id DESC;

SELECT id, session_uuid, customer_id, direction, billsec, rating_status,
       customer_charge, carrier_cost
FROM cdr
ORDER BY id DESC;
```

## Tests

```bash
cd /opt/switch/cdr-service
. .venv/bin/activate
python -m unittest -v
```
