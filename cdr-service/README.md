# FreeSWITCH CDR collector

This service receives `mod_json_cdr` documents on port `9000`, correlates the
A-leg and all B-leg attempts, and stores one row per logical call in PostgreSQL.
It is intentionally separate from the routing API and XML CURL service.

## Direction and leg correlation

FreeSWITCH `channel_data.direction` describes an individual channel leg. It is
not the customer-facing call direction. The collector determines business
direction in this order:

1. `variables.billing_direction`;
2. `variables.sip_h_X-Call-Direction`, supplied by Kamailio;
3. the original source IP in `source_ip_auth` (`CUSTOMER` means `OUTBOUND`,
   `CARRIER` means `INBOUND`).

A B-leg is recognized by `originating_leg_uuid`/`originator` and is stored under
that A-leg UUID. Legs may arrive in either order. Replayed leg UUIDs are counted
but not duplicated. All B-leg attempts are retained in `b_legs_json`, while the
call still occupies only one `cdrs` row.

The row stays `COLLECTING` until no new leg has arrived for
`MERGE_WAIT_SECONDS` (60 seconds by default). It then becomes `READY` and its
`rating_status` changes to `PENDING`. This accommodates out-of-order delivery,
failed attempts, and carrier failover. An A-leg-only failed call is also
finalized after this wait. A B-leg-only row is never rated because the owning
A-leg/customer context is missing.

If direction or customer ownership cannot be determined, the row becomes
`READY` with `rating_status=ERROR` instead of being billed. Conflicting
directions produce `rating_status=REVIEW`.

## Install and run

```bash
cd /opt/switch/cdr-service
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python cdr_server.py
```

The service creates the `cdrs` table and indexes from `schema.sql` when
`AUTO_CREATE_SCHEMA=true`.

Check it:

```bash
curl http://127.0.0.1:9000/health
curl -u freeswitch:change-me \
  -H 'Content-Type: application/json' \
  --data-binary @/var/log/freeswitch/json_cdr/example.cdr.json \
  http://127.0.0.1:9000/cdr
```

## FreeSWITCH `json_cdr.conf.xml`

Use an address reachable from FreeSWITCH. If both services run on the same
server, keep the collector private and use `127.0.0.1`.

```xml
<configuration name="json_cdr.conf" description="JSON CDR">
  <settings>
    <param name="log-b-leg" value="true"/>
    <param name="encode-values" value="false"/>
    <param name="url" value="http://127.0.0.1:9000/cdr"/>
    <param name="cred" value="freeswitch:change-me"/>
    <param name="auth-scheme" value="basic"/>
    <param name="timeout" value="5"/>
    <param name="retries" value="2"/>
    <param name="delay" value="5"/>
    <param name="queue-capacity" value="1000"/>
    <param name="log-http-and-disk" value="true"/>
    <param name="log-dir" value="/var/log/freeswitch/json_cdr"/>
    <param name="log-errors-to-disk" value="true"/>
    <param name="err-log-dir" value="/var/log/freeswitch/json_cdr_failed"/>
  </settings>
</configuration>
```

Set matching credentials in `.env`, then reload or restart FreeSWITCH after
changing the module configuration.

## Rating worker contract

The separate billing calculator should claim only rows with:

```sql
SELECT *
FROM cdrs
WHERE merge_status = 'READY'
  AND rating_status = 'PENDING'
ORDER BY finalized_at
FOR UPDATE SKIP LOCKED;
```

It should change `rating_status` to `PROCESSING`, then `RATED` or `ERROR`.
Rates and monetary values use PostgreSQL `NUMERIC(18, 6)`, not floating point.

## Tests

```bash
python -m unittest -v
```
