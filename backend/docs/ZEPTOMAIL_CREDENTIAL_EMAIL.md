# ZeptoMail credential delivery

The backend sends a one-time account-creation email after either of these
operations succeeds:

- `POST /api/v1/customers` for the new Customer Administrator.
- `POST /api/v1/support-members` for the new Support Member.

Email is sent only after the database create operation has completed. A mail
provider outage therefore does not roll back or duplicate the user account.
The create response includes one of these values:

```json
{ "credentialEmail": { "status": "SENT" } }
{ "credentialEmail": { "status": "FAILED" } }
{ "credentialEmail": { "status": "SKIPPED" } }
```

`SKIPPED` means `ZEPTOMAIL_ENABLED` is not `true`. `FAILED` means delivery was
enabled but configuration, timeout, network, or ZeptoMail rejected the request.
The plaintext password is used only to compose the creation email; the database
continues to store only its bcrypt hash, and the password is never logged.

## Configuration

Add the following values to `backend/.env`:

```dotenv
ZEPTOMAIL_ENABLED=true
ZEPTOMAIL_API_URL=https://api.zeptomail.com/v1.1/email
ZEPTOMAIL_SEND_MAIL_TOKEN=replace-with-your-zeptomail-send-mail-token
ZEPTOMAIL_FROM_ADDRESS=no-reply@your-verified-domain.example
ZEPTOMAIL_FROM_NAME=Switchboard
ZEPTOMAIL_TIMEOUT_MS=10000
PORTAL_LOGIN_URL=https://your-portal.example/login
```

The sender address/domain must be verified in ZeptoMail. The token may be stored
with or without the `Zoho-enczapikey ` prefix. Keep it only in the server secret
store or backend environment; never put it in frontend code.

Restart the backend after changing the environment:

```bash
pm2 restart switch-backend --update-env
```

Create a test Customer or Support Member and confirm the API response reports
`SENT`. Check backend logs for the recipient and provider status only; passwords
and the ZeptoMail token are intentionally excluded from logs.
