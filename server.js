import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "AGORA ENTERPRISES courier backend" });
});

// Authentication-only test. Does not create an order or shipment.
// Credentials stay on the server and the token is never sent to the browser.
app.post("/api/shiprocket/auth-check", async (_req, res) => {
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      message: "Shiprocket credentials are not configured on the server."
    });
  }

  try {
    const response = await fetch(
      "https://apiv2.shiprocket.in/v1/external/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      }
    );

    const data = await response.json();
    if (!response.ok || !data.token) {
      return res.status(502).json({
        ok: false,
        message: "Shiprocket authentication failed. Check API user email/password."
      });
    }

    return res.json({
      ok: true,
      message: "Shiprocket authentication successful. Token received securely."
    });
  } catch {
    return res.status(502).json({
      ok: false,
      message: "Could not connect to Shiprocket. Please try again."
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`AGORA backend listening on port ${port}`);
});
