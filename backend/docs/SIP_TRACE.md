# Native SIP trace

The billing-switch UI queries Homer 11 through the billing-switch backend. It
does not embed, redirect to, or expose the Homer UI.

```text
Kamailio -> HEP3/UDP 127.0.0.1:9060 -> Homer 11 DuckLake/Parquet
                                              |
billing-switch UI <- JSON <- Nest API <- Homer coordinator API :9088
```

## Storage

On the current switch server Homer stores SIP call packets in the DuckLake
dataset `homer_lake.hep_proto_1_call`, backed by Parquet files under
`/data/homer/parquet` and the catalog at `/data/homer/homer_catalog.sqlite`.
The billing-switch deliberately uses Homer's supported coordinator API instead
of opening those files or the SQLite catalog directly. This keeps storage
schema changes isolated to Homer and lets Homer perform time-window pruning.

Raw SIP packets remain in Homer. The billing-switch database contains a small
`customer_sip_traces` index with one row per finalized CDR. The row stores the
customer, assigned number, CDR/session identifiers, all known A-leg/B-leg
Call-IDs, and (after the first detail request) a JSON snapshot of the matched
Homer messages. This keeps tenant ownership and retention independent of the
Homer UI without duplicating the global capture store.

Apply the Prisma migration before starting the backend:

```bash
cd /opt/switch/backend
npx prisma migrate deploy
npx prisma generate
```

## Server preparation

1. Keep the Homer coordinator reachable from the machine running the Nest
   backend. For the current layout this is `http://10.30.0.61:9088`.
2. Enable static token access in Homer's `coordinator.api_settings`:

   ```json
   {
     "enable_token_access": true,
     "auth_token_header": "Auth-Token"
   }
   ```

3. Restart Homer and create a read-only/static API token in the Homer settings
   UI. Do not use the login password or JWT secret as this value.
4. Put the values in `backend/.env` on the machine running the backend:

   ```dotenv
   HOMER_API_BASE_URL=http://10.30.0.61:9088
   HOMER_API_TOKEN=<static Homer API token>
   HOMER_CAPTURE_ID=61
   HOMER_TRACE_WINDOW_SECONDS=300
   ```

5. Restart the Nest backend.

Set `VITE_HOMER_CAPTURE_ID=61` in `frontend/.env` if the capture agent uses a
different capture ID, then restart the frontend dev server or rebuild it.

Test the token from the backend machine (replace the placeholder locally):

```bash
curl -sS -X POST http://10.30.0.61:9088/api/v4/transactions/search \
  -H 'Content-Type: application/json' \
  -H 'Auth-Token: <static Homer API token>' \
  --data '{"filter":{"proto_type":1,"event_type":"call"},"param":{"limit":1},"timestamp":{"from":1777507200000,"to":1777593600000}}'
```

An HTTP 401 means the token is missing, invalid, or static token access is not
enabled. Restrict port 9088 to the backend host/VPN; browsers do not need direct
network access to Homer.

## Billing-switch API

### Global Super Admin debugging

These endpoints have no customer context. The upstream application must expose
them only to Super Admin users. Search results are filtered before returning to
the UI. At least one caller, callee, or CDR-linked customer number must exist in
Global Number Inventory. Direct message matches must also originate from a
configured source IP, carrier endpoint, or customer endpoint. A CDR does not
make an external caller or destination number "owned". Anonymous and unmapped
scanner traffic is hidden.

- `GET /api/v1/sip-trace/search`
- `GET /api/v1/sip-trace/calls/:callId`
- `GET /api/v1/sip-trace/calls/:callId/messages`
- `GET /api/v1/sip-trace/calls/:callId/flow`
- `GET /api/v1/sip-trace/calls/:callId/raw`
- `GET /api/v1/sip-trace/calls/:callId/logs`
- `GET /api/v1/sip-trace/calls/:callId/rtcp`

### Customer Latest Calls

Pass `X-Customer-ID` on every request. Ownership is resolved from finalized
CDRs, not from arbitrary INVITEs that happen to dial a DID:

- `GET /api/v1/sip-trace/customer/latest`
- `GET /api/v1/sip-trace/customer/calls/:id`
- `GET /api/v1/sip-trace/customer/calls/:id/messages`
- `GET /api/v1/sip-trace/customer/calls/:id/flow`
- `GET /api/v1/sip-trace/customer/calls/:id/raw`
- `GET /api/v1/sip-trace/customer/calls/:id/logs`
- `GET /api/v1/sip-trace/customer/calls/:id/rtcp`

The customer list contains at most 100 logical calls. A-leg and B-leg Call-IDs
from the same CDR are opened as one ordered ladder. Maintenance runs when the
list is requested and once every 24 hours. It removes only rows ranked beyond
the newest 100 for each customer; it does not delete traces merely because
they are old.

Search supports Call-ID, SIP method, caller/callee, source/destination IP and
port, response code, CSeq method, correlation ID/CTID, node, capture ID, and a
date/time window. Call detail accepts a comma-separated `callIds` query value so
the CDR page can combine related FreeSWITCH A-leg and B-leg Call-IDs into one
chronological ladder.

## Frontend

- **Global -> SIP Debugging** is the filtered, system-wide Super Admin view.
- **Customer -> Latest Calls** is the tenant-scoped list and native trace view.
- The CDR table contains rated/final records only and has no Homer or trace
  redirect.

The call detail is rendered inside Switchboard and contains the SIP ladder,
raw packet viewer, RTCP reports/stats, event logs, and raw-data tabs. Clicking a
ladder message selects its full SIP payload and SDP.
