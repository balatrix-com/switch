# Kamailio SIP edge

Use `kamailio.cfg` as the SIP proxy configuration for billing-switch. It is based on the working `switch/kamailio.cfg` topology, but forwards both the original source IP and port to FreeSWITCH.

The supplied configuration is set for public SIP IP `91.99.251.61` and private LAN/FreeSWITCH IP `10.30.0.61`. Confirm those values match the server interfaces before loading it.

Kamailio's `address` table is the edge allow-list:

- group `1`: carrier source IPs, routed as inbound calls;
- group `2`: customer source IPs, routed as outbound calls.

Synchronize the active `source_ip_auth` records before SIP testing. The script loads the colocated `.env` file automatically:

```powershell
python3 ./sync_source_auth.py
kamcmd permissions.addressReload
```

The config supports UDP and TCP destination endpoints. Add a TLS listener and `tls.so` certificate configuration before using TLS endpoints.

FreeSWITCH must accept calls from `LAN_IP:5070` and configure `mod_xml_curl` to POST dialplan requests to the Python `freeswitch-curl-service`.
