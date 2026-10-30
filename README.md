# AGORA ENTERPRISES Courier Platform

This is a full-stack starter implementation: customer registration/login, live Shiprocket courier quotes, booking requests, customer booking list, public booking lookup, admin APIs, PayU hosted-checkout initiation/callback handling, and shipment creation/AWB admin endpoints.

## Important before going live
- Requires a managed PostgreSQL database. Render free web services have ephemeral local files; this app uses PostgreSQL.
- PayU live credentials and merchant activation are not included. Do not add credentials to GitHub.
- Shiprocket credentials must be stored as Render environment variables.
- Verify the legal policies, refund timelines, address, trade/legal name, and four genuine service prices before requesting PayU review. This UI intentionally does not invent service prices.
- Have a developer/security reviewer test payment callbacks, PayU reverse hash and Verify Payment API/S2S reconciliation before accepting real payments. Never rely only on a browser redirect.
- Shipment creation is an admin-only operation and is blocked for prepaid bookings until payment callback marks payment SUCCESS. Check Shiprocket pickup location name and required order payload fields against your account before live shipments.
- Configure a strong unique SESSION_SECRET and ADMIN_PASSWORD. The admin account bootstrap/login endpoint is not exposed in this starter; add a separately secured admin provisioning flow before using admin APIs. Admin API claims require a signed admin token created securely by an operator/developer.
- Add service listings and actual INR rates once business pricing is confirmed.

## Render setup
1. Create a PostgreSQL database in Render and copy its Internal Database URL to `DATABASE_URL`.
2. Deploy this repository as a Node web service, build command blank, start command `npm start`.
3. Add `DATABASE_URL`, `SESSION_SECRET`, `BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SHIPROCKET_EMAIL`, and `SHIPROCKET_PASSWORD` in Render Environment.
4. Add PayU variables only after PayU provides/activates credentials: `PAYU_KEY`, `PAYU_SALT`, `PAYU_BASE_URL`, `PAYU_SUCCESS_URL`, `PAYU_FAILURE_URL`.
5. Deploy and verify `/api/health`.

## API overview
- `POST /api/register`, `POST /api/login`, `GET /api/me`, `POST /api/admin/login`
- `POST /api/quote`
- `POST /api/bookings`, `GET /api/bookings`, `GET /api/track/:code`
- `POST /api/payu/initiate` (authenticated)
- `GET /api/admin/summary`, `GET /api/admin/bookings`, `PATCH /api/admin/bookings/:id`
- `POST /api/admin/bookings/:id/create-shipment`
- `POST /api/admin/bookings/:id/awb`

The admin endpoints are intentionally inaccessible without a verified admin JWT. A secure admin provisioning/login route is a required deployment task; do not weaken this check or expose a hardcoded admin password.
