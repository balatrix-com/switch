# Authentication and authorization architecture

This document describes the current `billing-switch` implementation. The customer support channel is external to this application; a support request does not create a billing-system account automatically. A Super Admin reviews that request and explicitly creates or assigns a Support Member in the customer's **Support Members** tab.

## Identity model and relationships

`backend/prisma/schema.prisma` defines `User`, `Role`, `UserStatus`, `Customer`, and `SupportAssignment`.

| Role | Identity and customer relationship | Intended scope |
| --- | --- | --- |
| `SUPER_ADMIN` | `users.customer_id = NULL` | Global administration; may select any customer. |
| `CUSTOMER` | `users.customer_id` references exactly one customer | That customer's operational workspace only. |
| `SUPPORT_MEMBER` | `users.customer_id = NULL`; zero or more rows in `support_assignments` | Operational access to explicitly assigned, active customers. |

The support assignment has a composite primary key `(support_member_id, customer_id)`, so one member cannot be assigned twice to the same customer. Removing an assignment changes the member's API access on their next request. Suspending or soft-deleting the member prevents JWT validation on subsequent requests. The API never returns `passwordHash` from support management.

## Login for each role

All three roles use the same email/password endpoint: `POST /api/v1/auth/login` in `backend/src/auth/auth.controller.ts`. `AuthService.login` (`backend/src/auth/auth.service.ts`) lowercases the email, looks up the user, requires `ACTIVE` status, and compares the submitted password to the stored bcrypt hash. A Customer login additionally requires an associated active customer. The response contains an access token and a safe user object. A Support Member response also contains the member's assigned active customer summaries; it does not grant access to any other customer.

The frontend login form is `frontend/src/pages/LoginPage.tsx`. After login, Super Admin goes to `/`, Customer to `/dashboard`, and Support Member to `/support`. The Support Member page lists assigned customers and opens one customer workspace at a time. Customer users cannot create, assign, unassign, suspend, reset, or delete Support Members. Those management controls exist only in the Super Admin customer detail page at `/management/customers/:customerId/support-members`, backed by the Super Admin-only `/api/v1/support-members` endpoints.

The management API supports `GET /support-members`, `POST /support-members` (create, optionally with `customerId`), `PATCH /support-members/:id` (name/status), `POST /support-members/:id/reset-password`, `POST /support-members/:id/assignments`, `DELETE /support-members/:id/assignments/:customerId`, and `DELETE /support-members/:id` (soft delete and revoke all assignments). All paths here are under `/api/v1`. The controller, service, and request DTOs are in `backend/src/support-members/`.

The development cleanup/provisioning script `backend/scripts/cleanup-dev-customers.ts` can create a Super Admin using `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` (with development defaults in that file). **Do not run it to provision a normal environment:** it deletes development customers and resets assigned inventory. Provision production administrators deliberately, use a strong unique password, and change any development default immediately. The ordinary Prisma seed script does not create an administrator.

## JWT lifecycle

`AuthService.login` signs a JWT with `{ sub, email, name, role, customerId }`. `sub` is the user ID. The default expiry is `24h`, configurable through `JWT_EXPIRATION` in `backend/src/auth/auth.module.ts` / `backend/.env.example`. `JWT_SECRET` signs and verifies tokens. Production startup fails if it is missing; development uses an unpredictable process-local fallback, so tokens become invalid after restart. Never put the secret in the frontend.

The browser stores the access token in `localStorage` under `billing-switch.access-token` (`frontend/src/lib/api.ts`). Requests send it as `Authorization: Bearer <token>`. `frontend/src/context/AuthContext.tsx` calls `/auth/me` on startup; a `401` clears local storage and logs the user out. Logout is client-side token removal. There is **no refresh-token endpoint, token rotation, or automatic refresh** in the current implementation. At expiry the user signs in again. Changing or resetting a password does not currently revoke already-issued, unexpired tokens; status changes and support assignment changes are checked against the database on each request.

## Validation and authorization on the backend

The guards are registered globally in `backend/src/app.module.ts`, in this order:

1. `JwtAuthGuard` requires a valid bearer JWT except for `@Public()` routes (login and health). `JwtStrategy` (`backend/src/auth/strategies/jwt.strategy.ts`) verifies signature and expiry, then reads the active user from PostgreSQL on **every request**. It rejects inactive customer accounts and loads only active support assignments. The live database role is used; a role value left in an older token cannot override a changed database account.
2. `RolesGuard` enforces `@Roles(...)` metadata. Super Admin-only APIs include customer provisioning, carriers, number inventory, billing, global routing changes, and all Support Member management endpoints. A `403` is returned for other roles.
3. `SupportAccessGuard` defaults to deny for Support Members unless a controller explicitly carries `@SupportAccess()`. Opted-in controllers are customer-scoped operations and `/auth`; methods within them marked `@Roles(SUPER_ADMIN)` remain admin-only. This prevents new, undecorated global APIs from silently becoming available to Support Members.

The `@CustomerId()` decorator (`backend/src/common/decorators/customer-id.decorator.ts`) is the central tenant boundary:

- Customer: always uses the verified user's `customerId`; a spoofed `X-Customer-ID`, route parameter, or query value cannot change it.
- Super Admin: may select a customer with `:customerId`, `?customerId`, or `X-Customer-ID`; some global reads intentionally omit one.
- Support Member: must select a valid customer ID, even on endpoints that allow an optional ID for Super Admin. It must appear in `assignedCustomerIds` loaded from the database by the JWT strategy; otherwise the API returns `403`. Omitting customer context returns `400`, preventing accidental global reads. A body-supplied customer ID is not trusted as authorization context.

Customer-scoped service methods also query/update by customer ID. Support Members use the same operational endpoints as a Customer for assigned tenants: DIDs/number settings, IP authentication and SIP users, normalization, customer settings, CDR/recordings, live calls/listen, and customer diagnostics. Vendor cost and margin in CDR responses are hidden for both Customer and Support Member. Only Super Admin can assign outbound carriers/routes or manage global inventory. Carrier-owned IP authentication and global/carrier normalization creation are also blocked for non-admin roles.

## Frontend route and feature separation

`frontend/src/components/ProtectedRoute.tsx` checks signed-in state and allowed role for UI routes. `frontend/src/App.tsx` defines separate Super Admin (`/management`, `/global`), Customer (`/dashboard`, `/numbers`, `/extensions`, etc.), and Support Member (`/support`, `/support/customers/:customerId/:section`) routes and navigation. A Support Member sees only their assigned-customer list, one selected customer's operational tabs, and their profile. The customer-facing sidebar does not include Support Member management or outbound route assignment. Frontend hiding is convenience, **not** the security boundary; the backend guards and tenant decorator enforce permissions for direct HTTP requests too.

`frontend/src/context/AuthContext.tsx` stores the authenticated user and role. `frontend/src/lib/api.ts` adds the bearer token and, for selected-customer operations, `X-Customer-ID`. The Super Admin management UI is `frontend/src/components/SupportMembersPanel.tsx` in the Customer detail page. A member may be assigned to several customers. Suspending a member blocks all their logins/API requests; unassigning removes only one customer's access; deleting soft-deletes the account and removes all assignments. Password reset is a Super Admin operation.

## API permission summary

| Capability | Super Admin | Customer | Support Member |
| --- | --- | --- | --- |
| Login, own profile and password | Yes | Yes | Yes |
| Global customers, carriers, inventory, billing | Yes | No | No |
| Create/assign/manage Support Members | Yes | No | No |
| Customer operational edits | Any selected customer | Own customer | Assigned customer only |
| Assign outbound carrier/route | Yes | No | No |
| View CDR/vendor economics | Yes | Customer CDR only; no vendor economics | Assigned customer CDR only; no vendor economics |
| Live-call listen | Selected customer | Own customer | Assigned customer |

## Deployment and security notes

Apply `backend/prisma/migrations/20260917120000_add_support_members/migration.sql` using `npx prisma migrate deploy`, then run `npx prisma generate` and restart the backend. The migration is additive and does not move existing users. Set a strong `JWT_SECRET` in production. Review retention, recording/listen policy, and staff onboarding before assigning real support accounts. The current implementation does not include MFA, API login rate limiting, refresh tokens, centralized session revocation, or an audit trail for Support Member changes. Because the JWT lives in browser `localStorage`, an XSS flaw could expose it; strengthen the browser security posture or move to an HttpOnly-cookie session before treating staff access as a fully hardened production deployment.
