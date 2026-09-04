# Kamailio SIP edge

Use `kamailio.cfg` as the SIP proxy configuration for billing-switch. It is based on the working `switch/kamailio.cfg` topology, but forwards both the original source IP and port to FreeSWITCH.

The supplied configuration is set for public SIP IP `91.99.251.61` and private LAN/FreeSWITCH IP `10.30.0.61`. Confirm those values match the server interfaces before loading it.

Kamailio's `address` table is the edge allow-list:

- group `1`: carrier source IPs, routed as inbound calls;
- group `2`: customer source IPs, routed as outbound calls.

The Nest backend writes active source-auth rows automatically and calls
`permissions.addressReload` over JSON-RPC after create, edit, activation, or
deletion. Configure these variables in `backend/.env`:

```env
KAMAILIO_SYNC_ENABLED=true
KAMAILIO_DATABASE_URL=postgresql://kamailio:password@10.30.0.61:5432/kamailio
KAMAILIO_RPC_URL=http://10.30.0.61:8080/rpc
```

The script remains available as a recovery/import tool and loads its colocated
`.env` automatically:

```powershell
python3 ./sync_source_auth.py
kamcmd permissions.addressReload
```

Duplicate IP rows are supported because every source-auth record uses a unique
`billing-switch:<source-auth-id>` tag. `grp=1` identifies a carrier and `grp=2`
identifies a customer. If two customers use the same IP *and* source port, add a
distinct SIP username (or use distinct source ports); `grp` identifies the
source class, not the individual tenant.

The config supports UDP and TCP destination endpoints. Add a TLS listener and `tls.so` certificate configuration before using TLS endpoints.

FreeSWITCH must accept calls from `LAN_IP:5070` and configure `mod_xml_curl` to POST dialplan requests to the Python `freeswitch-curl-service`.
