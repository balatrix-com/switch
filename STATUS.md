# Billing Switch – Working Status

Last updated: 2026-09-07

## Scope

`billing-switch` is the routing/configuration and billing-support service. It is not responsible for application authentication or token verification. The frontend and Nest backend normally run locally; SIP services can run on the server.

## Frontend

- Location: `frontend/`
- React UI for customers, carriers, endpoints, numbers/DIDs, normalization, rate cards, assignments, minimum billing, CDRs, and SIP debugging.
- Customer Latest Calls must be customer-scoped; global SIP debugging is admin-scoped.
- Do not redirect users to Homer from CDR or customer pages.
- API base URL is configured by the frontend environment (local backend normally `http://localhost:3100/api/v1`).

## Backend

- Location: `backend/`
- NestJS API, Prisma schema/migrations, structured modules under `backend/src/`.
- Stores carriers, source IP/auth, customer endpoints, inventory and assigned numbers, routes/XML metadata, rate cards and mappings, raw live call events, finalized CDRs, and recording metadata.
- Important APIs include `/api/v1/source-ip-auth`, `/api/v1/number-inventory`, `/api/v1/rate-cards`, `/api/v1/cdrs`, and `/api/v1/sip-trace`.
- Live calls are proxied from the FreeSWITCH CURL service through `/api/v1/live-calls`; optional `X-Customer-ID` context scopes listing and hangup operations.
- Customer-related records must carry `customer_id`; route/number overrides take precedence over customer defaults.
- Kamailio synchronization is performed by the Kamailio module when source authentication changes.

## FreeSWITCH / XML

- Location: `freeswitch-curl-service/`
- Python `route_server.py` serves persisted XML and recording files. FreeSWITCH CURL is configured to call port `8000`.
- XML is generated from persisted routing configuration, not dynamically assembled by the frontend.
- Inbound flow: carrier identification → carrier ingress normalization → assigned DID lookup → customer/number override → customer endpoint egress normalization → bridge.
- Outbound flow: customer identification → customer ingress normalization → carrier route selection → carrier/customer egress normalization → bridge.
- Recording path convention: `/var/lib/freeswitch/recordings/{customer_id}/{uuid}.mp3`.
- The route server polls local FreeSWITCH ESL (`ESL_HOST`, `ESL_PORT`, `ESL_PASSWORD`) through `/live/calls`; hangup uses the token-protected `/live/channels/:uuid/kill` endpoint.
- Generated dialplans set/export native `accountcode` for tenant attribution. Unassign and DID filename changes delete stale files, while `POST /api/v1/route-xml/admin/cleanup-orphans` reconciles orphaned inbound XML and flushes the route cache.

## CDR services

- `cdr-service/` receives FreeSWITCH JSON CDR on port `9000`.
- Raw legs are stored in `live_call_event`; the live-call-to-cdr promotion merges legs when ready and writes one finalized row to `cdr`.
- Rating worker uses customer and carrier/vendor rate-card mappings and minimum-billing settings. A CDR needs both customer and carrier IDs for both-side rating.
- SIP trace is captured separately through Kamailio HEP/Homer and exposed through billing-switch APIs.

## Kamailio / SIP capture

- Location: `kamailio/`
- Kamailio routes SIP and sends HEP3 packets to Homer on UDP `127.0.0.1:9060`.
- Capture should exclude OPTIONS and registration traffic where configured. Frontend visibility must be limited to traces containing owned/assigned numbers; unknown scanner traffic is hidden.
- Homer UI is not the product UI. Billing-switch should query capture data and render its own ladder/raw-message view.

## Server/runtime reference

- Billing-switch database is PostgreSQL (`DATABASE_URL`); never commit credentials.
- Typical server services: Kamailio, FreeSWITCH, `route_server.py`, Homer, `cdr-service`, livecall-to-cdr, billing cache API, and rating worker.
- Keep server-only secrets and deployment `.env` files outside git.

## Verification checklist

1. Read this file before changing code.
2. Limit work to one module per task; inspect only related files.
3. Run targeted tests/lint first; run full backend/frontend builds once at the end.
4. For SIP issues, capture a single Call-ID and inspect Kamailio → Homer → backend → frontend in that order.
5. Record migrations, env changes, deployment commands, and unresolved issues here.

## Known follow-ups

- Continue improving SIP trace filtering/grouping and BYE/leg correlation.
- Confirm production Homer retention/cleanup policy and storage limits.
- Verify Kamailio RPC reload and duplicate-IP/group semantics in production.
