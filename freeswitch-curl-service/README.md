# FreeSWITCH CURL Service

This Python service is intentionally separate from the Node billing-switch backend.

- Node backend: stores structured carrier/customer/DID configuration and generates persisted XML.
- Python service: identifies the inbound carrier or outbound customer source, applies its ingress normalization, looks up the matching saved XML, and returns it to FreeSWITCH.
- The Python service never builds or changes dialplan XML.

## Shared XML directory

The backend defaults to writing files into this service's `xml` directory:

```text
billing-switch/freeswitch-curl-service/xml/inbound_8005551234.xml
billing-switch/freeswitch-curl-service/xml/outbound_<route-uuid>.xml
```

Set matching paths when the services run in separate containers or hosts:

```text
backend: XML_OUTPUT_DIR=/shared/billing-switch-xml
python:  XML_DIRECTORY=/shared/billing-switch-xml
```

Use a shared volume for `/shared/billing-switch-xml`.

## Run

```powershell
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL='postgresql://switchuser:password@127.0.0.1:5432/billing_switch'
python route_server.py
```

Health check: `GET http://localhost:8000/health`.

Configure FreeSWITCH `mod_xml_curl` to POST dialplan requests to `http://127.0.0.1:8000/`.

## Billing admission

Every routed call is checked before bridge. The service reads the live customer
wallet and effective customer/carrier rate cards from PostgreSQL, then atomically holds
the first rated block in Redis. Inbound TFN and Local calls use the shared DID
minute pool; outbound calls use the outbound pool. Remaining cost uses cash
and unused credit. Missing wallet/rate card, suspended customer, missing call
UUID, missing carrier rate card, or unavailable Redis all deny the call. The billing worker removes the
hold after the CDR is settled. Active calls are not periodically checked or
disconnected for balance depletion.

Set the same `REDIS_URL` in this service and `billing-engine`. The
`BILLING_ADMISSION_HOLD_SECONDS` expiry is a safety fallback if a CDR never
settles; set it longer than the longest permitted call. FreeSWITCH must include
`variable_uuid` (or `Unique-ID`) in the XML-curl request. Do not enable this
version on live traffic until one test call confirms that field is present.

The PostgreSQL wallet is authoritative. Redis stores only temporary active
holds; it does not mirror customer balances, so wallet top-ups and CDR debits
are reflected on the next admission without a separate balance-cache refresh.
`BILLING_ADMISSION_ENABLED=false` is an emergency rollback switch. For rollout,
deploy with it disabled, verify a real XML-curl request includes the call UUID,
then enable it and test a zero-balance and a free-minute customer. Redis should
use persistence (AOF) so a restart does not silently discard active holds.

When Kamailio is in front of FreeSWITCH, forward the original carrier/customer IP as `X-Source-IP`. Forwarding `X-Source-Port` is recommended when the same source IP has multiple source records; when it is absent, the service intentionally identifies by the forwarded IP because FreeSWITCH's network port belongs to Kamailio.

Inbound lookup uses the normalized number in `route_xml.match_number`. Outbound lookup identifies the customer first, normalizes the number using that customer's source/endpoint ingress profile, then finds an active `EXACT` outbound route owned by that customer. Prefix outbound routes cannot use one pre-generated XML file and are rejected for SIP routing.

## Cache refresh

```powershell
Invoke-RestMethod -Method Post http://localhost:8000/admin/cache/flush -Headers @{ 'X-Cache-Token' = 'change-me' }
```

Carrier/profile and normalized-DID lookup caches expire automatically according to `CACHE_TTL_SECONDS`. The Node backend calls this flush endpoint after configuration changes. XML content is still read from disk on every request.

## Tests

```powershell
python -m unittest discover -s tests -v
```

## Recording retention cleanup

Recording billing fixes each file's `rec.expiry` using the customer's assigned
recording rate card at billing time. Changing a rate card later does not
retroactively change existing expiry dates. The daily cleanup deletes only
tracked MP3 files whose expiry date is **before** the current UTC date. For a
7-day card this is calendar-day retention, not an exact 168-hour deadline.
The `rec` billing row and wallet transaction remain in the database. Cleanup
sets `purge_status` to `DELETED`, `MISSING`, or `ERROR`, and records the attempt,
completion time, error, and freed bytes. Errors are retried on the next run.

The job must run on the host that has **all** files under
`RECORDINGS_DIRECTORY`. Do not enable the same job on separate recording hosts
that only have subsets of the files: a file on another host would be marked
`MISSING`. If recording storage is distributed, add a storage-node identifier
and scope cleanup by node before enabling it.

Deploy in this order:

1. Apply the backend Prisma migrations with `npx prisma migrate deploy` in
   `backend`. They add the purge fields and a concurrent index; they do not
   delete files.
2. Deploy the new `recording_cleanup.py` and updated `route_server.py` to the
   FreeSWITCH host. Restart `fscurl` **after** deploying both files, so the old
   in-process purge thread is gone. Do not start the timer until this is done.
3. Create `/etc/billing-switch/recording-cleanup.env` from
   `systemd/recording-cleanup.env.example`. Set the actual database URL and
   recordings directory. Restrict this file to root (mode `0600`). The job
   runs as `freeswitch`; systemd reads this environment file before switching
   users. Adjust service paths and `ReadWritePaths` if your deployment differs.
4. Copy `systemd/recording-cleanup.service` and `.timer` into
   `/etc/systemd/system/`, then run `systemctl daemon-reload`. Preview the
   eligible files without deleting them by running `recording_cleanup.py
   --dry-run` with the configured database URL and recordings directory in
   its environment. Verify that every candidate belongs to this storage host
   before enabling the timer.

   From a root shell on the recording host, after editing the environment
   file, one preview command is:

   ```bash
   set -a
   . /etc/billing-switch/recording-cleanup.env
   set +a
   runuser -u freeswitch -- /opt/switch/freeswitch-curl-service/.venv/bin/python /opt/switch/freeswitch-curl-service/recording_cleanup.py --dry-run
   unset DATABASE_URL RECORDINGS_DIRECTORY
   ```
5. Run `systemctl start recording-cleanup.service` once, inspect
   `journalctl -u recording-cleanup.service`, then enable the daily timer with
   `systemctl enable --now recording-cleanup.timer`. It runs at 02:15 UTC,
   with `Persistent=true` so a missed run executes after reboot.

The script processes at most 50,000 recordings per run, in batches of 100.
An `ERROR` entry is tried at most once per run. It refuses malformed paths,
other customers' paths, symlinks, and non-files. Existing orphan files without
a `rec` row are **not deleted**; they need a separate report and deliberate
reconciliation because the job cannot infer their retention safely.
If the cap is reached with more eligible rows, the job logs a backlog and
exits nonzero; run it again or raise `--max-files` after checking capacity.

To inspect status and recovered space:

```sql
SELECT purge_status, COUNT(*), COALESCE(SUM(purged_bytes), 0) AS bytes_freed
FROM rec
WHERE expiry < (NOW() AT TIME ZONE 'UTC')::date
GROUP BY purge_status;
```
