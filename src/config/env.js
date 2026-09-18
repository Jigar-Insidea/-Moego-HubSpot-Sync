const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '10000', 10),

  // MoeGo
  MOEGO_API_KEY_B64: process.env.MOEGO_API_KEY_B64 || '',
  MOEGO_BASE_URL: process.env.MOEGO_BASE_URL || 'https://openapi.moego.pet',
  MOEGO_COMPANY_ID: process.env.MOEGO_COMPANY_ID || 'copaRXx',
  MOEGO_BUSINESS_IDS: (process.env.MOEGO_BUSINESS_IDS || 'bizT2HX,bizVaEO').split(',').map(s => s.trim()),

  // HubSpot
  HUBSPOT_ACCESS_TOKEN: process.env.HUBSPOT_ACCESS_TOKEN || '',
  HUBSPOT_PORTAL_ID: process.env.HUBSPOT_PORTAL_ID || '245256880',
  HUBSPOT_PIPELINE_ID: process.env.HUBSPOT_PIPELINE_ID || 'default',

  // Sync Schedule Configuration (Default: Every 5 Minutes)
  CRON_RECONCILE_SCHEDULE: process.env.CRON_RECONCILE_SCHEDULE || '*/5 * * * *',
  SYNC_STATE_DB_PATH: process.env.SYNC_STATE_DB_PATH || path.resolve(process.cwd(), 'data/sync_state.json')
};

module.exports = env;
