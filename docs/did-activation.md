# DID activation controls

The Super Admin DID table (`/global/did`) shows **Active**, **Available**, **Disabled by Super Admin**, or **Deactivated by Subscription**. Its switch changes only the Super Admin flag. It does not call the subscription endpoint.

Two independent flags are stored on `global_number_inventory`: `manually_disabled` and `subscription_disabled`. For an assigned DID, `customer_numbers.status` is `SUSPENDED` when either flag is set, so the routing resolver and FreeSWITCH XML lookup reject inbound calls. Clearing one flag cannot reactivate a DID while the other flag remains set. The subscription reason takes precedence in the main status badge; the table also notes when both reasons apply. Existing `SUSPENDED` numbers were migrated as manually disabled.

## APIs

Both APIs take JSON `{ "enabled": true | false }` and return the inventory number with `activationStatus`. Disabling invalidates generated DID XML and flushes the XML-curl cache. Enabling rebuilds the route where an assigned DID has valid routing settings; a `routeWarning` is returned if rebuilding fails.

- `PATCH /api/v1/number-inventory/:id/activation` — Super Admin JWT only. Changes `manually_disabled`. This is the only endpoint used by the frontend switch.
- `PATCH /api/v1/subscription/dids/:id/activation` — reserved for a future subscription workflow. Changes `subscription_disabled`. It requires `X-Subscription-Did-Token` equal to `SUBSCRIPTION_DID_API_TOKEN` in the backend environment. The endpoint fails closed with `503` until a non-default token is configured. It is **not** called by the frontend or `sub-billing` yet.

The `:id` is the `global_number_inventory.id`, not the customer-number assignment ID. The APIs are idempotent; setting an already-set flag is safe. Disabled unassigned DIDs cannot be assigned until all disable flags are cleared. To activate the subscription endpoint later, set a strong secret in the backend environment and send it only from the trusted subscription service, never from a browser.
