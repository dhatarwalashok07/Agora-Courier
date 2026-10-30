# AGORA Courier v2
Customer-facing courier rate checker using Shiprocket serviceability API.

Render settings: Build `npm install`; Start `npm start`.
Set these Render Environment variables (never upload them to GitHub):
- `SHIPROCKET_EMAIL`: Shiprocket API user email
- `SHIPROCKET_PASSWORD`: API password received in the registered email
- `SHIPROCKET_PICKUP_PINCODE`: `342001`

Includes `/api/health` and `POST /api/quote`.
This is a rate-check milestone only: no persistent booking database, shipment/AWB creation, PayU checkout, or tracking yet. Render free storage is ephemeral; production bookings need persistent storage.
