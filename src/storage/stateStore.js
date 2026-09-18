const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const logger = require('../utils/logger');

let cache = null;

function getStorePath() {
  const p = env.SYNC_STATE_DB_PATH.replace(/\.db$/, '.json');
  return p;
}

function loadStore() {
  if (cache) return cache;

  const storePath = getStorePath();
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(storePath)) {
    try {
      const raw = fs.readFileSync(storePath, 'utf-8');
      cache = JSON.parse(raw);
    } catch (err) {
      logger.warn(`Failed to parse state store at ${storePath}, initializing fresh state.`);
      cache = { cursors: {}, history: [] };
    }
  } else {
    cache = { cursors: {}, history: [] };
    saveStore();
  }

  return cache;
}

function saveStore() {
  if (!cache) return;
  const storePath = getStorePath();
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${storePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(cache, null, 2), 'utf-8');
  fs.renameSync(tmpPath, storePath);
}

function getSyncCursor(key, defaultValue = '1970-01-01T00:00:00Z') {
  const store = loadStore();
  return store.cursors && store.cursors[key] ? store.cursors[key] : defaultValue;
}

function setSyncCursor(key, value) {
  const store = loadStore();
  if (!store.cursors) store.cursors = {};
  store.cursors[key] = value;
  saveStore();
}

function logSyncRun(syncType, status, metrics = {}, details = '') {
  const store = loadStore();
  if (!store.history) store.history = [];

  const entry = {
    id: store.history.length + 1,
    syncType,
    status,
    recordsProcessed: metrics.processed || 0,
    recordsCreated: metrics.created || 0,
    recordsUpdated: metrics.updated || 0,
    errorsCount: metrics.errors || 0,
    details: typeof details === 'object' ? JSON.stringify(details) : String(details),
    completedAt: new Date().toISOString()
  };

  store.history.unshift(entry);
  // Keep last 50 entries
  if (store.history.length > 50) {
    store.history = store.history.slice(0, 50);
  }
  saveStore();
  return entry;
}

function getSyncHistory(limit = 10) {
  const store = loadStore();
  return (store.history || []).slice(0, limit);
}

module.exports = {
  getSyncCursor,
  setSyncCursor,
  logSyncRun,
  getSyncHistory
};
