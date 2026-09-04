# Kamailio authentication and call-recording deployment

## 1. Apply the billing-switch migration

From the backend directory:

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
```

The migration removes the duplicate-IP restriction, adds
`customer_settings.recording_enabled`, and makes new customer IDs random,
unique six-digit numeric codes. Existing UUID customer IDs are deliberately
retained so live routes, XML files, CDRs, and parent-platform references are not
broken during deployment.

## 2. Give the backend limited Kamailio database access

Use a dedicated PostgreSQL login when possible. It needs only the Kamailio
`address` table and its sequence:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.address TO billing_switch_kamailio;
GRANT USAGE, SELECT ON SEQUENCE public.address_id_seq TO billing_switch_kamailio;
```

Set the backend environment:

```env
KAMAILIO_SYNC_ENABLED=true
KAMAILIO_DATABASE_URL=postgresql://billing_switch_kamailio:password@10.30.0.61:5432/kamailio
KAMAILIO_RPC_URL=http://10.30.0.61:8080/rpc
KAMAILIO_RPC_TIMEOUT_MS=5000
```

The backend writes carrier sources with `grp=1`, customer sources with `grp=2`,
and a stable `billing-switch:<source-auth-id>` tag. It then calls
`permissions.addressReload`. Restrict TCP port 8080 with the server firewall to
the backend host/VPN because this Kamailio RPC listener does not perform user
authentication.

Copy the updated `kamailio/kamailio.cfg`, validate it, and restart Kamailio:

```bash
kamailio -c -f /etc/kamailio/kamailio.cfg
systemctl restart kamailio
systemctl status kamailio --no-pager
```

Test JSON-RPC before testing the panel:

```bash
curl -sS -X POST http://10.30.0.61:8080/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"permissions.addressReload","id":1}'
```

After the backend starts, reconcile all existing source-auth records once:

```bash
curl -sS -X POST http://127.0.0.1:3100/api/v1/source-ip-auth/sync-kamailio
```

## 3. Prepare FreeSWITCH recording storage

On the FreeSWITCH server:

```bash
install -d -o freeswitch -g freeswitch -m 0770 /var/lib/freeswitch/recordings
fs_cli -x "show modules like mod_shout"
```

MP3 recording requires `mod_shout`. Install/load that FreeSWITCH module if the
second command does not show it.

Add to `freeswitch-curl-service/.env`:

```env
RECORDINGS_DIRECTORY=/var/lib/freeswitch/recordings
RECORDING_ACCESS_TOKEN=replace-with-a-long-random-secret
```

Add the matching values to `backend/.env` (the backend may remain on the local
development computer as long as it can reach the server):

```env
FREESWITCH_RECORDINGS_DIR=/var/lib/freeswitch/recordings
RECORDING_SERVICE_URL=http://10.30.0.61:8000
RECORDING_ACCESS_TOKEN=replace-with-the-same-long-random-secret
```

Deploy the updated Python file and restart its PM2 process:

```bash
cd /opt/switch/freeswitch-curl-service
pm2 restart fscurl --update-env
pm2 logs fscurl --lines 50
```

Enable **Record answered calls** under **Customer → Main**. Saving this setting
regenerates inbound DID and outbound XML. Generated calls use:

```xml
<action application="set" data="RECORD_STEREO=true"/>
<action application="set" data="recording_follow_transfer=true"/>
<action application="set" data="execute_on_answer=record_session /var/lib/freeswitch/recordings/{customerId}/${uuid}.mp3"/>
```

The Python service creates the customer directory before returning enabled XML.
FreeSWITCH writes audio directly to disk; neither Nest nor Python is in the RTP
or recording-write path. The CDR page streams an existing recording through the
backend and the token-protected Python endpoint.

## 4. Duplicate-IP limitation

Duplicate database entries and duplicate Kamailio address rows are allowed.
Groups distinguish carrier traffic (`1`) from customer traffic (`2`). They do
not distinguish two different customers that send from the same IP and source
port. Configure a distinct source port or SIP authentication username for that
case; the route service rejects an ambiguous match rather than routing a call
under the wrong customer.
