const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');

const axiosInstance = axios.create({
  baseURL: env.MOEGO_BASE_URL,
  headers: {
    'Authorization': `Basic ${env.MOEGO_API_KEY_B64}`,
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

let staffMapCache = null;
let staffCacheTimestamp = 0;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestWithRetry(config, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axiosInstance(config);
      return response.data;
    } catch (err) {
      const status = err.response ? err.response.status : 0;
      const isRateLimitOr5xx = status === 429 || (status >= 500 && status < 600);
      if (i < retries - 1 && (isRateLimitOr5xx || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')) {
        const delay = Math.pow(2, i) * 1000;
        logger.warn(`MoeGo API request failed (${status || err.code}). Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

/**
 * Fetches and caches the complete staff directory from MoeGo
 */
async function getStaffMap(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && staffMapCache && (now - staffCacheTimestamp < CACHE_TTL_MS)) {
    return staffMapCache;
  }

  try {
    const data = await requestWithRetry({
      method: 'POST',
      url: '/v1/staffs:list',
      data: {
        companyId: env.MOEGO_COMPANY_ID,
        includeDeleted: true,
        pagination: { pageSize: 100, pageToken: '1' }
      }
    });

    const map = {};
    const staffs = data.staffs || [];
    for (const s of staffs) {
      const id = s.id;
      const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.name || '';
      if (id) {
        map[id] = name;
      }
    }

    staffMapCache = map;
    staffCacheTimestamp = now;
    logger.info(`Loaded ${Object.keys(map).length} staff members into MoeGo staff cache.`);
    return map;
  } catch (err) {
    logger.error('Failed to load MoeGo staff directory: %s', err.message);
    return staffMapCache || {};
  }
}

async function resolveStaffName(staffId) {
  if (!staffId) return '';
  const map = await getStaffMap();
  return map[staffId] || 'Staff Posh Paws';
}

/**
 * Fetch a single customer by ID
 */
async function getCustomerById(customerId) {
  return requestWithRetry({
    method: 'GET',
    url: `/v1/customers/${customerId}`
  });
}

/**
 * List all customers with pagination
 */
async function listCustomers(pageToken = '1', pageSize = 100) {
  return requestWithRetry({
    method: 'POST',
    url: '/v1/customers:list',
    data: {
      companyId: env.MOEGO_COMPANY_ID,
      pagination: { pageSize, pageToken: String(pageToken) }
    }
  });
}

/**
 * List all pets with pagination
 */
async function listPets(pageToken = '1', pageSize = 100) {
  return requestWithRetry({
    method: 'POST',
    url: '/v1/pets:list',
    data: {
      companyId: env.MOEGO_COMPANY_ID,
      pagination: { pageSize, pageToken: String(pageToken) }
    }
  });
}

/**
 * List appointments with pagination
 */
async function listAppointments(pageToken = '1', pageSize = 100) {
  return requestWithRetry({
    method: 'POST',
    url: '/v1/appointments:list',
    data: {
      companyId: env.MOEGO_COMPANY_ID,
      businessIds: env.MOEGO_BUSINESS_IDS,
      pagination: { pageSize, pageToken: String(pageToken) }
    }
  });
}

/**
 * Scans recent pages first for customer appointments, with fast fallback
 */
async function getAllAppointmentsForCustomer(customerId, maxPages = 15) {
  const customerAppointments = [];
  let page = 1;
  while (page <= maxPages) {
    const data = await listAppointments(page, 100);
    const apts = data.appointments || [];
    if (!apts.length) break;

    for (const a of apts) {
      if (a.customerId === customerId) {
        customerAppointments.push(a);
      }
    }

    if (!data.nextPageToken || data.nextPageToken === '') break;
    page++;
  }
  return customerAppointments;
}

module.exports = {
  getStaffMap,
  resolveStaffName,
  getCustomerById,
  listCustomers,
  listPets,
  listAppointments,
  getAllAppointmentsForCustomer
};
