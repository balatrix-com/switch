# Billing Switch API Reference

Base URL: `http://localhost:3100/api/v1`

Interactive documentation: `http://localhost:3100/api/docs`

OpenAPI JSON: `http://localhost:3100/api/docs-json`

## Trust model

This service does not authenticate users, verify bearer tokens, or decide application permissions. The upstream application must authenticate and authorize the request before forwarding it.

For every customer-scoped endpoint, the upstream application sends:

```http
X-Customer-ID: 2d0e8b1d-55f2-4d45-9cf8-d91e6c59db3e
```

The value must be a UUID. It is used in database ownership filters for reads, creates, updates, and deletes. Do not expose this service directly to the public internet; a caller that can reach it can supply any customer ID.

## Recommended configuration order

```text
1. Create customer
2. Create normalization profiles
3. Create carrier and carrier endpoint
4. Create carrier source IP/auth identity
5. Create customer endpoint
6. Add number to global inventory
7. Assign inventory number to customer
8. Configure number settings
9. Create inbound/outbound customer routes
10. Resolve/preview routing and inspect XML
```

## Health

### `GET /health`

No customer header required.

## Customers

| Method | Path | Customer header | Purpose |
| --- | --- | --- | --- |
| GET | `/customers` | No | List customers |
| POST | `/customers` | No | Create customer and default settings |
| GET | `/customers/current` | Yes | Get the upstream-selected customer |
| PATCH | `/customers/current/settings` | Yes | Update customer routing defaults |
| GET | `/customers/:id` | No | Get customer by ID |
| PATCH | `/customers/:id` | No | Update customer identity/status |

Create example:

```json
{
  "accountCode": "ACME-001",
  "name": "ACME Telecom",
  "creditBalance": 250.00,
  "currency": "USD",
  "defaultChannelLimit": 50,
  "defaultCallerIdMode": "PASSTHROUGH",
  "isActive": true
}
```

Default-settings example:

```json
{
  "defaultEndpointId": "CUSTOMER_ENDPOINT_UUID",
  "defaultIngressProfileId": "PROFILE_UUID",
  "defaultEgressProfileId": "PROFILE_UUID",
  "defaultCallerIdMode": "PASSTHROUGH",
  "defaultCallTimeoutSeconds": 60,
  "defaultChannelLimit": 50,
  "defaultDestinationType": "CUSTOMER_ENDPOINT"
}
```

## Normalization profiles

| Method | Path | Customer header | Purpose |
| --- | --- | --- | --- |
| GET | `/normalization-profiles` | Optional | List global and selected owner profiles |
| POST | `/normalization-profiles` | Required for `CUSTOMER` | Create profile |
| PATCH | `/normalization-profiles/:id` | Required for customer-owned update | Update profile |

Owner types are `GLOBAL`, `CARRIER`, and `CUSTOMER`. Customer-owned profiles take the customer ID from the header, not the body.

```json
{
  "name": "Carrier strip +1",
  "ownerType": "CARRIER",
  "carrierId": "CARRIER_UUID",
  "steps": [
    { "operation": "TRIM" },
    { "operation": "STRIP_PREFIX", "value": "+1" }
  ]
}
```

Operations: `TRIM`, `DIGITS_ONLY`, `STRIP_PLUS`, `ENSURE_PLUS`, `STRIP_PREFIX`, `ADD_PREFIX`, `STRIP_LEADING_ONE`, `ENSURE_LEADING_ONE`, `REGEX_REPLACE`.

## Carriers

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/carriers` | List carriers with endpoints/routes |
| POST | `/carriers` | Create carrier |
| GET | `/carriers/:id` | Get carrier |
| PATCH | `/carriers/:id` | Update carrier defaults |
| DELETE | `/carriers/:id` | Delete carrier |
| POST | `/carriers/:carrierId/endpoints` | Create carrier gateway |
| PATCH | `/carriers/:carrierId/endpoints/:id` | Update gateway |
| DELETE | `/carriers/:carrierId/endpoints/:id` | Delete gateway |
| POST | `/carriers/:carrierId/routes` | Add carrier prefix route |
| DELETE | `/carriers/:carrierId/routes/:id` | Delete carrier route |

Carrier endpoint example:

```json
{
  "name": "Carrier Primary",
  "host": "sip.carrier.example",
  "port": 5060,
  "transport": "UDP",
  "direction": "BOTH",
  "authType": "IP",
  "ingressNormalizationProfileId": "PROFILE_UUID",
  "egressNormalizationProfileId": "PROFILE_UUID",
  "channelLimit": 500,
  "priority": 100,
  "isActive": true
}
```

Carrier route example:

```json
{
  "carrierEndpointId": "CARRIER_ENDPOINT_UUID",
  "name": "US route",
  "matchPrefix": "1",
  "priority": 100,
  "channelLimit": 500,
  "isActive": true
}
```

## Customer endpoints

All endpoints require `X-Customer-ID`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/customer-endpoints` | List selected customer's gateways |
| POST | `/customer-endpoints` | Create gateway for selected customer |
| PATCH | `/customer-endpoints/:id` | Update only if owned by selected customer |
| DELETE | `/customer-endpoints/:id` | Delete only if owned by selected customer |

```json
{
  "name": "PBX Primary",
  "host": "203.0.113.20",
  "port": 5060,
  "transport": "UDP",
  "direction": "BOTH",
  "authType": "IP",
  "egressNormalizationProfileId": "PROFILE_UUID",
  "channelLimit": 30,
  "priority": 100,
  "isActive": true
}
```

## SIP source identification

These records identify the origin of actual SIP calls. They are routing configuration, not application authentication.

| Method | Path | Customer header | Purpose |
| --- | --- | --- | --- |
| GET | `/source-ip-auth` | Optional | List all or selected customer's entries |
| POST | `/source-ip-auth` | Required for `CUSTOMER` | Create carrier/customer SIP source |
| DELETE | `/source-ip-auth/:id` | Optional | Remove entry, scoped when header is supplied |

Carrier source example:

```json
{
  "sourceType": "CARRIER",
  "ipAddress": "198.51.100.10",
  "port": 5060,
  "carrierId": "CARRIER_UUID",
  "carrierEndpointId": "CARRIER_ENDPOINT_UUID",
  "ingressNormalizationProfileId": "PROFILE_UUID",
  "isActive": true
}
```

## Global inventory and assignment

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/number-inventory?status=AVAILABLE` | List inventory |
| POST | `/number-inventory` | Add global number |
| POST | `/number-inventory/:id/assign` | Transactionally assign to customer |
| DELETE | `/number-inventory/:id/assignment` | Unassign when no active routes exist |

Add number:

```json
{
  "canonicalNumber": "8005551234",
  "displayNumber": "+18005551234",
  "numberType": "TFN",
  "countryCode": "US"
}
```

Assign number:

```json
{
  "customerId": "CUSTOMER_UUID",
  "label": "Sales TFN"
}
```

## Customer numbers and per-number settings

All endpoints require `X-Customer-ID`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/customer-numbers` | List assigned numbers/settings/routes |
| GET | `/customer-numbers/:id` | Get one owned assignment |
| PATCH | `/customer-numbers/:id/settings` | Upsert number-level overrides |

```json
{
  "destinationType": "CUSTOMER_ENDPOINT",
  "primaryEndpointId": "CUSTOMER_ENDPOINT_UUID",
  "failoverEndpointId": "FAILOVER_ENDPOINT_UUID",
  "egressNormalizationProfileId": "PROFILE_UUID",
  "callerIdMode": "PASSTHROUGH",
  "callTimeoutSeconds": 30,
  "channelLimit": 10
}
```

For external forwarding, use `destinationType: EXTERNAL_NUMBER`, `forwardNumber`, and `outboundCarrierEndpointId`.

## Customer outbound routes

All endpoints require `X-Customer-ID`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/switch-routes?direction=OUTBOUND` | List selected customer's outbound routes |
| GET | `/switch-routes/global?direction=OUTBOUND` | List all outbound routes for the Super Admin console; no customer header |
| GET | `/switch-routes/:id` | Get owned route |
| POST | `/switch-routes` | Create tenant route |
| PATCH | `/switch-routes/:id` | Update an outbound tenant route |
| DELETE | `/switch-routes/:id` | Delete owned route |

Inbound routes are rejected by this API. Configure inbound delivery through `PATCH /customer-numbers/:id/settings`; a successful save generates the DID XML file.

Outbound route:

```json
{
  "name": "US outbound",
  "direction": "OUTBOUND",
  "matchType": "PREFIX",
  "matchValue": "1",
  "destinationType": "CARRIER_ENDPOINT",
  "targetCarrierId": "CARRIER_UUID",
  "targetCarrierEndpointId": "CARRIER_ENDPOINT_UUID",
  "priority": 100,
  "isActive": true
}
```

## Route resolution

### `POST /routing/customer/outbound`

Requires `X-Customer-ID`. This is a configuration-preview endpoint for checking which outbound route applies to a customer.

```json
{
  "destinationNumber": "18005559876",
  "callerIdNumber": "12125550100",
  "customerEndpointId": "OPTIONAL_SOURCE_ENDPOINT_UUID"
}
```

Returns:

```json
{
  "plan": {
    "direction": "OUTBOUND",
    "customerId": "CUSTOMER_UUID",
    "routeId": "ROUTE_UUID",
    "lookupNumber": "18005559876",
    "primary": {
      "destinationType": "CARRIER_ENDPOINT",
      "host": "sip.carrier.example",
      "port": 5060,
      "transport": "UDP",
      "number": "+18005559876"
    }
  },
  "xml": "<?xml version=..."
}
```

### `POST /routing/resolve`

Diagnostic configuration preview using SIP source identity:

```json
{
  "direction": "INBOUND",
  "sourceIp": "198.51.100.10",
  "sourcePort": 5060,
  "destinationNumber": "+18005551234",
  "callerIdNumber": "+12125550100"
}
```

For inbound calls, carrier ingress normalization happens before the assigned-number lookup.

FreeSWITCH must not use a Node route-resolution endpoint. Configure it to call the separate Python `freeswitch-curl-service`. The Python service identifies the carrier, applies carrier ingress normalization, queries `route_xml.match_number` for an active assigned DID, and then reads the persisted file named by that database row.

The backend automatically rebuilds affected DID XML after customer defaults, endpoint, DID override, carrier, or normalization-profile changes. If a DID can no longer produce a valid route, its stale XML database row and file are removed. The manual rebuild endpoints remain available for operations and recovery.

## Persisted DID XML

Both endpoints require `X-Customer-ID`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/route-xml` | List generated XML for selected customer |
| GET | `/route-xml/did/:customerNumberId` | Get generated XML metadata/content for an assigned DID |
| POST | `/route-xml/did/:customerNumberId/rebuild` | Regenerate one assigned DID XML file |
| POST | `/route-xml/rebuild-dids` | Regenerate every configured DID for the selected customer |
| GET | `/route-xml/:routeId` | Read legacy/outbound route XML metadata when present |

## Outbound SIP routes

Customer routes are outbound-only. When an active outbound route is created or updated, the backend generates and saves `outbound_<route-id>.xml`. The FreeSWITCH CURL service identifies the customer source first, applies customer ingress normalization, and retrieves the XML by the normalized exact route match.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/switch-routes` | Create an outbound route and generate its XML |
| PATCH | `/switch-routes/:id` | Update an outbound route and regenerate its XML |
| POST | `/switch-routes/:id/rebuild` | Regenerate one outbound route XML file |

SIP outbound routes require `matchType: "EXACT"`. This is intentional: a static XML file can safely contain the final, normalized destination only for one exact dialled number.

## SIP trace and call debugging

These endpoints query a tenant-owned logical-call index and Homer, returning
normalized JSON for the native Switchboard debugger. They do not return or
redirect to the Homer UI. The upstream application must restrict the global
endpoints to Super Admins. Valid CDR Call-IDs link both legs only after the CDR
is matched to an active assigned number, so unrelated scanner INVITEs do not
appear in the global frontend.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/sip-trace/indexed-calls` | Search up to 200 merged, owned-number logical calls |
| GET | `/sip-trace/indexed-calls/:id` | Merged call detail from the global index |
| GET | `/sip-trace/indexed-calls/:id/flow` | Canonical ladder summary and messages without raw bodies |
| GET | `/sip-trace/indexed-calls/:id/messages/:messageId/raw` | Lazily fetch one selected raw SIP message |
| GET | `/sip-trace/indexed-calls/:id/logs` | Correlated Homer events/logs for an indexed call |
| GET | `/sip-trace/indexed-calls/:id/rtcp` | Correlated QoS/RTCP data for an indexed call |
| GET | `/sip-trace/search` | Search captured SIP messages using signaling and time filters |
| GET | `/sip-trace/calls/:callId` | Combined call summary, participants, and messages |
| GET | `/sip-trace/calls/:callId/messages` | Chronological normalized SIP messages |
| GET | `/sip-trace/calls/:callId/flow` | Ladder-ready endpoints and elapsed timing |
| GET | `/sip-trace/calls/:callId/raw` | Raw SIP payloads |
| GET | `/sip-trace/calls/:callId/messages/:messageId/raw` | One selected raw SIP payload |
| GET | `/sip-trace/calls/:callId/logs` | Correlated Homer events/logs |
| GET | `/sip-trace/calls/:callId/rtcp` | Correlated QoS/RTCP data |

Customer Latest Calls requires `X-Customer-ID`. These endpoints resolve tenant
ownership from finalized CDR records, merge the A-leg/B-leg Call-IDs into one
logical trace, and never accept a customer ID from query/body data.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/sip-trace/customer/latest` | Latest 100 logical trace calls owned by the customer |
| GET | `/sip-trace/customer/calls/:id` | Tenant-owned merged call detail |
| GET | `/sip-trace/customer/calls/:id/messages` | Tenant-owned chronological SIP messages |
| GET | `/sip-trace/customer/calls/:id/flow` | Tenant-owned ladder data |
| GET | `/sip-trace/customer/calls/:id/raw` | Tenant-owned raw SIP payloads |
| GET | `/sip-trace/customer/calls/:id/messages/:messageId/raw` | One selected tenant-owned raw SIP payload |
| GET | `/sip-trace/customer/calls/:id/logs` | Tenant-owned correlated events/logs |
| GET | `/sip-trace/customer/calls/:id/rtcp` | Tenant-owned correlated QoS/RTCP data |

The CDR database trigger updates the logical-call index and keeps the newest 100
traces per customer immediately. Daily cleanup is a repair/backfill safety net
and does not apply an age cutoff. Customer list requests never run synchronization.
The CDR API intentionally has no SIP-trace redirect.

See `docs/SIP_TRACE.md` for server configuration and environment variables.

## Error behavior

- `400`: missing/malformed customer header, invalid normalization/configuration
- `404`: route, number, carrier endpoint, or customer endpoint not found
- `409`: duplicate source/route/number assignment or unsafe unassignment
- `500`: unexpected database/runtime failure

The upstream application should pass through a safe error code/message while recording the full internal response for operations support.
