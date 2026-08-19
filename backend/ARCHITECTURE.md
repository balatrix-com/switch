# Billing Switch Architecture

## Module boundaries

```text
carriers
  Carrier -> CarrierEndpoint -> CarrierRoute

customers
  Customer -> CustomerSettings
           -> CustomerEndpoint
           -> SourceIpAuth
           -> CustomerNumber -> NumberSettings -> RouteXml + DID XML file
           -> SwitchRoute (outbound only)

number-inventory
  GlobalNumberInventory -> CustomerNumber

normalization
  NormalizationProfile -> ordered steps

routing configuration
  DID settings -> DidXmlGenerationService -> RouteXmlBuilderService -> persisted XML

FreeSWITCH adapter (separate Python directory)
  carrier source/profile lookup -> normalized DID key -> persisted XML file
```

`NormalizationProfile` supports ordered `TRIM`, `DIGITS_ONLY`, `STRIP_PLUS`, `ENSURE_PLUS`, `STRIP_PREFIX`, `ADD_PREFIX`, `STRIP_LEADING_ONE`, `ENSURE_LEADING_ONE`, and `REGEX_REPLACE` operations. Profiles can be global, carrier-owned, or customer-owned.

## Inbound order

```text
carrier source IP/auth identification
  -> source endpoint or carrier ingress profile
  -> normalize raw destination
  -> exact lookup in assigned customer numbers using normalized value
  -> derive customer_id from assignment
  -> load DID/customer settings
  -> customer endpoint egress normalization
     OR customer then carrier egress normalization for external forwarding
  -> caller ID and channel settings
  -> read the XML file generated when DID settings were saved
```

There is no fallback lookup of the raw carrier number. If carrier ingress normalization changes `+18005551234` to `8005551234`, only `8005551234` is searched in `global_number_inventory` through its active `customer_numbers` assignment.

## Outbound order

```text
customer source IP/auth identification
  -> customer endpoint/default ingress normalization
  -> tenant-only exact/longest-prefix outbound route lookup
  -> explicit/default carrier selection
  -> longest-prefix carrier route lookup
  -> customer route/default egress normalization
  -> carrier route/endpoint/default egress normalization
  -> caller ID and channel settings
  -> FreeSWITCH XML
```

Outbound route lookup always includes `customer_id`; one customer's prefixes cannot route another customer's call.

## Settings precedence

For inbound customer delivery:

```text
number setting
  -> destination customer endpoint setting
  -> customer default
```

For external/carrier delivery, customer-side and carrier-side normalization are separate stages:

```text
number/customer egress profile
  -> carrier route/carrier endpoint/carrier default egress profile
```

Only non-null values override the next layer. This allows a number to change only its destination while inheriting the customer timeout and caller-ID behavior, or a route to override just the timeout.

## Match behavior

1. Exact match wins over prefix match.
2. The longest matching prefix wins.
3. Lower numeric `priority` wins when matches are otherwise equal.
4. Inbound customer routes are not accepted; each canonical DID is the inbound lookup key.
5. Carrier routes use longest prefix and then priority.

## Trust and isolation invariants

- Authentication and authorization are owned by the upstream application, not this service.
- Customer context is supplied through `X-Customer-ID` and validated as a UUID.
- The service must remain private because the customer header is trusted context, not proof of identity.
- Ownership checks run before endpoint, number, route, or settings mutations.
- Global number assignment uses a transaction and a conditional `AVAILABLE` claim.
- A number with an active linked route cannot be unassigned.
- SIP passwords are represented only as hashes or pre-encrypted values; management list APIs redact them.
- Database cascade behavior removes tenant children, while global inventory is restricted from accidental assignment deletion.

## Deployment notes

- FreeSWITCH must call the standalone Python service, not the Node API.
- Share the configured XML directory between the Node backend and Python service.
- Configure PostgreSQL backups before production migrations.
- Use a secret manager for endpoint credentials and database secrets.
- Keep Kamailio responsible for source permission reloads and SIP digest enforcement. This backend is the source of truth; a deployment adapter can subscribe to mutations and synchronize Kamailio's address/subscriber tables.
- Channel limits use FreeSWITCH's `limit hash` application. For a multi-FreeSWITCH cluster, replace the local hash backend with a shared limit backend.
- DID XML is regenerated immediately when DID Override, customer defaults, or a referenced customer endpoint changes.
