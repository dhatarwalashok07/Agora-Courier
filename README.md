# AGORA ENTERPRISES — Courier backend starter

This is a safe first-stage starter for testing Shiprocket authentication.

## Included
- Mobile-friendly starter page
- Express backend
- `/api/health` status endpoint
- `/api/shiprocket/auth-check` authentication-only endpoint
- `.env.example` and `.gitignore`

## Important
- No real order or shipment is created.
- No payment is collected.
- Never put Shiprocket credentials in frontend files, public repositories, or chat.
- Configure `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD` as private environment variables on the hosting service.
- Use the API user's email and the password delivered to the registered Shiprocket account email.

## Run locally
1. Install Node.js.
2. Copy `.env.example` to `.env`.
3. Fill in the credentials in `.env`.
4. Run `npm install` then `npm start`.
5. Open `http://localhost:3000`.

For deployment, use a Node.js hosting service and set the two environment variables in its private Environment settings.
