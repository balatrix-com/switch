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
