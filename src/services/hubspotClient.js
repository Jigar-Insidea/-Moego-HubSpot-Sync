const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');

const axiosInstance = axios.create({
  baseURL: 'https://api.hubapi.com',
  headers: {
    'Authorization': `Bearer ${env.HUBSPOT_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestWithRetry(config, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axiosInstance(config);
      return response.data;
    } catch (err) {
      const status = err.response ? err.response.status : 0;
      const isRateLimit = status === 429;
      const isServerErr = status >= 500 && status < 600;

      if (i < retries - 1 && (isRateLimit || isServerErr || err.code === 'ECONNABORTED')) {
        const retryAfter = err.response?.headers?.['retry-after'];
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, i) * 1000 + Math.random() * 500;
        logger.warn(`HubSpot API ${config.method} ${config.url} failed (${status}). Retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
      } else {
        if (status === 400) {
          const detail = err.response?.data?.message || JSON.stringify(err.response?.data || {});
          logger.error(`HubSpot 400 Validation Error on ${config.method} ${config.url}: ${detail}`);
        }
        throw err;
      }
    }
  }
}

/**
 * Clean & sanitize properties before pushing to HubSpot
 */
function sanitizeProperties(props) {
  const clean = {};
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null) {
      const strVal = String(v).trim();
      // Only keep non-empty strings (or allow empty closedate)
      if (strVal !== '' || k === 'closedate') {
        clean[k] = strVal;
      }
    }
  }
  return clean;
}

/**
 * Upsert Contact in HubSpot via unique idProperty (moego_customer_id)
 */
async function upsertContact(moegoCustomerId, rawProperties) {
  const properties = sanitizeProperties(rawProperties);
  try {
    const existing = await requestWithRetry({
      method: 'GET',
      url: `/crm/v3/objects/contacts/${encodeURIComponent(moegoCustomerId)}?idProperty=moego_customer_id`
    });
    const contactId = existing.id;
    await requestWithRetry({
      method: 'PATCH',
      url: `/crm/v3/objects/contacts/${contactId}`,
      data: { properties }
    });
    return { id: contactId, action: 'UPDATED' };
  } catch (err) {
    if (err.response && err.response.status === 404) {
      try {
        const created = await requestWithRetry({
          method: 'POST',
          url: '/crm/v3/objects/contacts',
          data: { properties }
        });
        return { id: created.id, action: 'CREATED' };
      } catch (createErr) {
        if (createErr.response && createErr.response.status === 409) {
          const match = createErr.response.data?.message?.match(/Existing ID: (\d+)/);
          if (match) {
            const existingId = match[1];
            await requestWithRetry({
              method: 'PATCH',
              url: `/crm/v3/objects/contacts/${existingId}`,
              data: { properties }
            });
            return { id: existingId, action: 'UPDATED' };
          }
        }
        throw createErr;
      }
    }
    throw err;
  }
}

/**
 * Upsert Pet (Company Object) in HubSpot via unique idProperty (moego_pet_id)
 */
async function upsertPet(moegoPetId, rawProperties) {
  const properties = sanitizeProperties(rawProperties);
  try {
    const existing = await requestWithRetry({
      method: 'GET',
      url: `/crm/v3/objects/companies/${encodeURIComponent(moegoPetId)}?idProperty=moego_pet_id&properties=pet_status,name`
    });
    const companyId = existing.id;
    
    // Terminal status rule: Passed Away can never be changed automatically
    if (existing.properties?.pet_status === 'Passed Away' && properties.pet_status !== 'Passed Away') {
      properties.pet_status = 'Passed Away';
    }

    await requestWithRetry({
      method: 'PATCH',
      url: `/crm/v3/objects/companies/${companyId}`,
      data: { properties }
    });
    return { id: companyId, action: 'UPDATED' };
  } catch (err) {
    if (err.response && err.response.status === 404) {
      try {
        const created = await requestWithRetry({
          method: 'POST',
          url: '/crm/v3/objects/companies',
          data: { properties }
        });
        return { id: created.id, action: 'CREATED' };
      } catch (createErr) {
        if (createErr.response && (createErr.response.status === 400 || createErr.response.status === 409)) {
          const match = createErr.response.data?.message?.match(/(\d+) already has that value/);
          if (match) {
            const existingId = match[1];
            await requestWithRetry({
              method: 'PATCH',
              url: `/crm/v3/objects/companies/${existingId}`,
              data: { properties }
            });
            return { id: existingId, action: 'UPDATED' };
          }
        }
        throw createErr;
      }
    }
    throw err;
  }
}

/**
 * Upsert Appointment (Deal) in HubSpot via unique idProperty (moego_appointment_id)
 */
async function upsertDeal(moegoAppointmentId, rawProperties) {
  const properties = sanitizeProperties(rawProperties);
  try {
    const existing = await requestWithRetry({
      method: 'GET',
      url: `/crm/v3/objects/deals/${encodeURIComponent(moegoAppointmentId)}?idProperty=moego_appointment_id`
    });
    const dealId = existing.id;
    await requestWithRetry({
      method: 'PATCH',
      url: `/crm/v3/objects/deals/${dealId}`,
      data: { properties }
    });
    return { id: dealId, action: 'UPDATED' };
  } catch (err) {
    if (err.response && err.response.status === 404) {
      try {
        const created = await requestWithRetry({
          method: 'POST',
          url: '/crm/v3/objects/deals',
          data: { properties }
        });
        return { id: created.id, action: 'CREATED' };
      } catch (createErr) {
        if (createErr.response && (createErr.response.status === 400 || createErr.response.status === 409)) {
          const match = createErr.response.data?.message?.match(/(\d+) already has that value/);
          if (match) {
            const existingId = match[1];
            await requestWithRetry({
              method: 'PATCH',
              url: `/crm/v3/objects/deals/${existingId}`,
              data: { properties }
            });
            return { id: existingId, action: 'UPDATED' };
          }
        }
        throw createErr;
      }
    }
    throw err;
  }
}

/**
 * Associate Pet (Company) to Owner (Contact)
 */
async function associatePetToContact(companyId, contactId) {
  if (!companyId || !contactId) return null;
  try {
    return await requestWithRetry({
      method: 'POST',
      url: '/crm/v3/associations/companies/contacts/batch/create',
      data: {
        inputs: [{
          from: { id: String(companyId) },
          to: { id: String(contactId) },
          type: 'company_to_contact'
        }]
      }
    });
  } catch (err) {
    logger.warn(`Association Pet ${companyId} -> Contact ${contactId} failed: ${err.message}`);
    return null;
  }
}

/**
 * Associate Deal (Appointment) to Contact
 */
async function associateDealToContact(dealId, contactId) {
  if (!dealId || !contactId) return null;
  try {
    return await requestWithRetry({
      method: 'POST',
      url: '/crm/v3/associations/deals/contacts/batch/create',
      data: {
        inputs: [{
          from: { id: String(dealId) },
          to: { id: String(contactId) },
          type: 'deal_to_contact'
        }]
      }
    });
  } catch (err) {
    logger.warn(`Association Deal ${dealId} -> Contact ${contactId} failed: ${err.message}`);
    return null;
  }
}

/**
 * Associate Deal (Appointment) to Pet (Company)
 */
async function associateDealToPet(dealId, companyId) {
  if (!dealId || !companyId) return null;
  try {
    return await requestWithRetry({
      method: 'POST',
      url: '/crm/v3/associations/deals/companies/batch/create',
      data: {
        inputs: [{
          from: { id: String(dealId) },
          to: { id: String(companyId) },
          type: 'deal_to_company'
        }]
      }
    });
  } catch (err) {
    logger.warn(`Association Deal ${dealId} -> Pet ${companyId} failed: ${err.message}`);
    return null;
  }
}

module.exports = {
  upsertContact,
  upsertPet,
  upsertDeal,
  associatePetToContact,
  associateDealToContact,
  associateDealToPet,
  sanitizeProperties
};
