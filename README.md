# MoeGo <-> HubSpot Integration Middleware

Production synchronization middleware connecting **MoeGo POS/CRM** and **HubSpot CRM** for **Vera's Posh Paws**.

---

## Architecture Overview

* **Runtime:** Node.js (v20+) with Express, Axios, Winston, and node-cron.
* **Sync Direction:** Strictly One-Way (`MoeGo -> HubSpot`).
* **HubSpot Objects:**
  * **Contacts:** Customer profiles with phone E.164 normalization, full raw address, location (`Moore` / `OKC`), status (`Active` / `Inactive`), referral source, active pet summary, and appointment metrics roll-up.
  * **Pets (Companies):** Repurposed Company object storing pet profiles. `domain` is never written to prevent auto-merging pets with common names. Linked to Owner Contact.
  * **Appointments (Deals):** Synced into the `MoeGo Appointments` deal pipeline with 6 mapped stages. Dual-associated to **both** Contact and Pet.
* **Nightly Reconciliation:** Automated background cron job running at 2:00 AM UTC to reconcile all delta updates.
* **Real-Time Webhooks:** Fast REST endpoints accepting MoeGo customer, pet, and appointment events.

---

## 5 Core Business Rules

1. **Upsert on MoeGo IDs:** Contacts match on `moego_customer_id`, Pets on `moego_pet_id`, and Deals on `moego_appointment_id` using HubSpot API v3 `idProperty`.
2. **NEVER Write Company Domain:** Prevents HubSpot from collapsing distinct pets with the same name (e.g. "Bella").
3. **Never Delete:** Inactive/deleted pets in MoeGo are marked `Inactive` in HubSpot.
4. **`Passed Away` is Terminal:** Once a pet is marked `Passed Away`, the sync engine will never automatically move it back to `Active` or `Inactive`.
5. **Execution Order:** Contacts $\rightarrow$ Pets $\rightarrow$ Deals $\rightarrow$ Dual Associations.

---

## Quick Start (Local)

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```

3. **Run Automated Tests:**
   ```bash
   npm test
   ```

4. **Start Service:**
   ```bash
   npm start
   # or development mode with live reload:
   npm run dev
   ```

5. **Trigger Historical Backfill via CLI:**
   ```bash
   npm run sync:full
   ```

---

## API Endpoints

* `GET /health` - Health check endpoint for monitoring & Render uptime.
* `GET /status` - Current sync status, last backfill timestamp, and sync history.
* `POST /webhooks/moego/all` - Webhook receiver for MoeGo events.
* `POST /api/sync/customer/:id` - On-demand sync for a single customer tree.
* `POST /api/sync/reconcile` - Manually trigger reconciliation job.
* `POST /api/sync/full` - Manually trigger complete historical backfill.

---

## Deployment on Render

See [DEPLOYMENT_RENDER.md](./DEPLOYMENT_RENDER.md) for full step-by-step instructions on deploying this service to Render using the included `render.yaml` Blueprint or Docker container.
