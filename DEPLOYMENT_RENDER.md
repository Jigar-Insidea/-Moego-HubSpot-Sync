# Render Deployment Guide

This guide walks you through deploying the **MoeGo <-> HubSpot Sync Middleware** service to [Render](https://render.com).

---

## Method 1: Deploy via Render Blueprint (`render.yaml`) [Recommended]

1. **Push Code to GitHub / GitLab:**
   Ensure the `moego-hubspot` repository is pushed to your Git provider:
   ```bash
   cd "/Users/praveenkrishnabhasme/Desktop/INSIDEA Projects/moego-hubspot"
   git init
   git add .
   git commit -m "feat: initial production release of moego-hubspot sync middleware"
   git remote add origin https://github.com/Jigar-Insidea/-Moego-HubSpot-Sync.git
   git push -u origin main
   ```

2. **Connect Blueprint in Render:**
   * Log into [Render Dashboard](https://dashboard.render.com).
   * Click **New +** $\rightarrow$ select **Blueprint**.
   * Connect your `moego-hubspot` repository.
   * Render will automatically read `render.yaml` and configure:
     * **Service Type:** Web Service (Node.js)
     * **Name:** `moego-hubspot-sync`
     * **Build Command:** `npm install`
     * **Start Command:** `npm start`
     * **Health Check Path:** `/health`
     * **Persistent Disk:** `sync-state-data` mounted at `/var/data` (1 GB)

3. **Set Environment Variables in Render:**
   In the Render Dashboard for `moego-hubspot-sync`, ensure the following environment variables are set under **Environment**:

   | Variable Name | Value / Description | Secret / Plaintext |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Plaintext |
   | `PORT` | `10000` | Plaintext |
   | `MOEGO_API_KEY_B64` | *[Your Base64 MoeGo API Key]* | **Secret** |
   | `MOEGO_BASE_URL` | `https://openapi.moego.pet` | Plaintext |
   | `MOEGO_COMPANY_ID` | `copaRXx` | Plaintext |
   | `MOEGO_BUSINESS_IDS`| `bizT2HX,bizVaEO` | Plaintext |
   | `HUBSPOT_ACCESS_TOKEN` | *[Your HubSpot Private App Token]* | **Secret** |
   | `HUBSPOT_PORTAL_ID` | `245256880` | Plaintext |
   | `HUBSPOT_PIPELINE_ID`| `default` | Plaintext |
   | `CRON_RECONCILE_SCHEDULE` | `*/5 * * * *` *(Runs every 5 minutes)* | Plaintext |
   | `SYNC_STATE_DB_PATH` | `/var/data/sync_state.json` | Plaintext |

4. **Deploy Service:**
   * Click **Apply**.
   * Render will build and deploy the service. Once deployed, the service will be live at `https://<your-render-subdomain>.onrender.com`.

---

## Method 2: Manual Web Service Setup on Render

If creating manually without Blueprints:
1. In Render, click **New +** $\rightarrow$ **Web Service**.
2. Connect your Git repository.
3. Select **Node** as runtime (or **Docker** using the provided `Dockerfile`).
4. Set:
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
5. Under **Advanced**:
   * Add a Persistent Disk: Name = `sync-state-data`, Mount Path = `/var/data`, Size = `1 GB`.
   * Set Health Check Path to `/health`.
6. Add all environment variables from the table above and click **Create Web Service**.

---

## Post-Deployment Verification

1. **Verify Health Check:**
   ```bash
   curl https://<your-service>.onrender.com/health
   # Response: {"status":"HEALTHY","service":"moego-hubspot-sync", ...}
   ```

2. **Trigger Initial Full Backfill (Optional via HTTP):**
   ```bash
   curl -X POST https://<your-service>.onrender.com/api/sync/full
   # Response: {"status":"TRIGGERED","message":"Full historical backfill started in background"}
   ```

3. **Check Status & History:**
   ```bash
   curl https://<your-service>.onrender.com/status
   ```

4. **Configure MoeGo Webhooks (Optional):**
   * Point your MoeGo webhook settings to `https://<your-service>.onrender.com/webhooks/moego/all`.
