# Billing Switch Backend

NestJS/Prisma backend for multi-tenant carrier-to-customer and customer-to-carrier routing with FreeSWITCH XML generation.

The project follows the feature-module layout of `wlabel/pbx-whitelable/backend`; routing behavior is derived from the prototype in `switch`. The reference folders are not runtime dependencies.

## What is implemented

- Carrier, carrier endpoint, carrier route, and carrier normalization configuration
- Customer-scoped endpoints, defaults, DIDs, DID overrides, outbound routes, source identities, and persisted XML files
- Separate global number inventory with transactional assignment/unassignment
- Ordered ingress and egress normalization profiles
- Exact and longest-prefix route selection with priority ordering
- DID -> endpoint/customer-default inbound precedence
- Caller-ID modification, external forwarding, failover, call timeouts, and channel limits
- Persisted DID XML generation and upstream customer-context route previews
- Trusted `X-Customer-ID` context with strict database ownership filtering
- Interactive Swagger/OpenAPI documentation and an importable Postman collection

## Upstream application boundary

This service intentionally does not authenticate users, verify tokens, or evaluate application roles. The main application performs those responsibilities and forwards a trusted customer UUID on customer-scoped requests:

```http
X-Customer-ID: 2d0e8b1d-55f2-4d45-9cf8-d91e6c59db3e
```

The header is context, not authentication. Keep `billing-switch` on a private network and allow only the main backend, FreeSWITCH, and Kamailio to reach it. SIP digest validation remains the responsibility of the SIP edge.

Every customer-owned database record carries `customerId`. Endpoint, number, route, settings, and XML queries always include the supplied customer ID.

Global inventory remains separate:

```text
global_number_inventory
  -> customer_numbers (customer_id required)
     -> number_settings (customer_id required)
     -> route_xml metadata + persisted inbound XML file

switch_routes (customer_id required, outbound only)
```

## Setup

```bash
npm install
npm run prisma:generate
npm run prisma:migrate -- --name remove_application_auth
npm run prisma:seed
npm run start:dev
```

Default URLs:

- API: `http://localhost:3100/api/v1`
- Swagger UI: `http://localhost:3100/api/docs`
- OpenAPI JSON: `http://localhost:3100/api/docs-json`

## HTTP request logs

Every API request is logged automatically. The log includes the request ID, HTTP method, path, response status, duration, trusted customer context, and source IP. Request bodies, passwords, and authorization values are not logged.

```text
[HTTP] --> [e941...] POST /api/v1/switch-routes customer_id=2d0e... ip=127.0.0.1
[HTTP] <-- [e941...] POST /api/v1/switch-routes 201 18.4ms customer_id=2d0e...
```

Clients may provide `X-Request-ID`; otherwise the backend generates one and returns it in the `X-Request-ID` response header.

## Documentation and testing

- [Complete API reference](docs/API_REFERENCE.md)
- [Testing without a frontend](docs/TESTING.md)
- [Importable Postman collection](docs/Billing-Switch.postman_collection.json)
- [Architecture and routing order](ARCHITECTURE.md)

The fastest manual test is Swagger UI. Click **Authorize**, enter a customer UUID in `customer-context`, and call customer-scoped endpoints. This sets `X-Customer-ID`; there is no login or bearer token.

## Key endpoints

| Area | Endpoints |
| --- | --- |
| Carriers | `/carriers`, `/carriers/:id/endpoints`, `/carriers/:id/routes` |
| Customers/defaults | `/customers`, `/customers/current`, `/customers/current/settings` |
| Customer endpoints | `/customer-endpoints` |
| SIP source identification | `/source-ip-auth` |
| Normalization | `/normalization-profiles` |
| Global inventory | `/number-inventory`, `/number-inventory/:id/assign` |
| Customer numbers | `/customer-numbers`, `/customer-numbers/:id/settings` |
| Outbound tenant routes | `/switch-routes` |
| Stored DID XML | `/route-xml`, `/route-xml/did/:customerNumberId`, `/route-xml/rebuild-dids` |
| Configuration preview | `/routing/customer/outbound`, `/routing/resolve` |

Saving `PATCH /customer-numbers/:id/settings` generates the inbound DID XML immediately and writes it to `XML_OUTPUT_DIR`. FreeSWITCH must not call this Node API for XML. Use the separate [`freeswitch-curl-service`](../freeswitch-curl-service/README.md), which reads the generated files.

Customer-context outbound preview:

```bash
curl -X POST http://localhost:3100/api/v1/routing/customer/outbound \
  -H "Content-Type: application/json" \
  -H "X-Customer-ID: YOUR_CUSTOMER_UUID" \
  -d '{"destinationNumber":"18005559876","callerIdNumber":"12125550100"}'
```

Actual SIP-source resolution:

```bash
curl -X POST http://localhost:3100/api/v1/routing/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "direction": "INBOUND",
    "sourceIp": "198.51.100.10",
    "sourcePort": 5060,
    "destinationNumber": "+18005551234",
    "callerIdNumber": "+12125550100"
  }'
```

## Verification

```bash
npm run build
npm test
npm run lint
npx prisma validate
```

Tests cover ordered normalization, XML generation and escaping, DID XML file persistence, channel/caller-ID actions, and carrier ingress normalization before DID lookup.
