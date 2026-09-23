# ZeptoMail credential delivery

The backend supports credential delivery through these operations:

- `POST /api/v1/customers/:id/send-credentials` sends Customer Administrator
  credentials after the complete onboarding workflow succeeds.
- `POST /api/v1/support-members` sends credentials when a new Support Member is
  created because that account does not use the multi-step customer workflow.

`POST /api/v1/customers` deliberately does not send email. The final delivery
endpoint is restricted to Super Admin, looks up the active administrator for
the requested customer, and verifies that the submitted password matches the
stored bcrypt hash before sending it:

```json
{ "password": "the-same-password-used-during-customer-creation" }
```

The delivery response includes one of these values:

```json
{ "credentialEmail": { "status": "SENT" } }
{ "credentialEmail": { "status": "FAILED" } }
{ "credentialEmail": { "status": "SKIPPED" } }
```

`SKIPPED` means `ZEPTOMAIL_ENABLED` is not `true`. `FAILED` means delivery was
enabled but configuration, timeout, network, or ZeptoMail rejected the request.
Neither result removes or changes the completed customer account. The frontend
must not roll back onboarding when only credential delivery fails.
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

Complete a test Customer onboarding, call the final credential endpoint, and
confirm its response reports `SENT`. Creating a Customer alone must not send an
email. Creating a Support Member should continue to send immediately. Check
backend logs for the recipient and provider status only; passwords and the
ZeptoMail token are intentionally excluded from logs.
