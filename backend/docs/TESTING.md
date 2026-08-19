# Testing Without a Frontend

## Recommended method

Use three layers:

1. **Swagger UI** for individual manual requests and discovering fields.
2. **Postman collection** for the complete setup and routing workflow with saved IDs.
3. **Jest/Supertest** for repeatable regression testing in CI.

Swagger is the fastest starting point. Postman is better when one response ID is needed by the next request. Automated tests should be used before deployment.

## Swagger UI

Start the backend:

```bash
npm run start:dev
```

Open:

```text
http://localhost:3100/api/docs
```

For a customer-scoped endpoint, click **Authorize**, enter the customer UUID in `customer-context`, and click **Authorize**. Swagger sends it as `X-Customer-ID`—there is no login or bearer token.

Use this first smoke sequence:

1. `GET /api/v1/health`
2. `POST /api/v1/customers`
3. Copy the returned `id` into Swagger's `customer-context` authorization field.
4. `POST /api/v1/customer-endpoints`
5. `GET /api/v1/customer-endpoints`
6. `POST /api/v1/number-inventory`
7. `POST /api/v1/number-inventory/{id}/assign`
8. `GET /api/v1/customer-numbers`
9. Configure routes and call `POST /api/v1/routing/customer/outbound`.

## Postman

Import [Billing-Switch.postman_collection.json](Billing-Switch.postman_collection.json).

The collection starts with `baseUrl=http://localhost:3100`. The create requests save returned UUIDs into collection variables. Run requests in folder order, or use Postman Collection Runner.

## cURL/PowerShell smoke tests

Health:

```bash
curl http://localhost:3100/api/v1/health
```

List one customer's endpoints:

```bash
curl http://localhost:3100/api/v1/customer-endpoints \
  -H "X-Customer-ID: YOUR_CUSTOMER_UUID"
```

Preview outbound routing:

```bash
curl -X POST http://localhost:3100/api/v1/routing/customer/outbound \
  -H "Content-Type: application/json" \
  -H "X-Customer-ID: YOUR_CUSTOMER_UUID" \
  -d '{"destinationNumber":"18005559876","callerIdNumber":"12125550100"}'
```

PowerShell equivalent:

```powershell
$headers = @{ 'X-Customer-ID' = 'YOUR_CUSTOMER_UUID' }
$body = @{
  destinationNumber = '18005559876'
  callerIdNumber = '12125550100'
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:3100/api/v1/routing/customer/outbound' `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body $body
```

## Automated checks

```bash
npm run build
npm test
npm run lint
npx prisma validate
```

For a staging integration test, use a separate PostgreSQL database, apply migrations, seed known customer/carrier data, then run HTTP tests against the real application. Never run destructive integration cleanup against production.
