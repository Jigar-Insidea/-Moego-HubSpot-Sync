const cron = require('node-cron');
const env = require('../config/env');
const { runFullBackfill, syncCustomerBundle } = require('./syncEngine');
const { getSyncCursor, setSyncCursor, logSyncRun } = require('../storage/stateStore');
const logger = require('../utils/logger');

let isJobRunning = false;
let jobStartedAt = null;
const LOCK_TIMEOUT_MS = 25 * 60 * 1000; // 25-minute safety lock timeout

/**
 * Checks and acquires execution lock
 */
function acquireLock() {
  const now = Date.now();
  if (isJobRunning) {
    if (jobStartedAt && (now - jobStartedAt > LOCK_TIMEOUT_MS)) {
      logger.warn(`Previous sync lock exceeded timeout (${Math.round((now - jobStartedAt) / 60000)}m). Releasing stale lock.`);
      isJobRunning = false;
    } else {
      const elapsedMinutes = jobStartedAt ? Math.round((now - jobStartedAt) / 60000) : 0;
      logger.info(`[CONCURRENCY LOCK] A sync cycle is currently underway (running for ~${elapsedMinutes}m). Skipping this trigger to prevent duplicate operations.`);
      return false;
    }
  }

  isJobRunning = true;
  jobStartedAt = now;
  return true;
}

/**
 * Releases execution lock
 */
function releaseLock() {
  isJobRunning = false;
  jobStartedAt = null;
}

/**
 * Executes a safe, locked reconciliation pass
 */
async function executeReconciliation() {
  if (!acquireLock()) {
    return { status: 'SKIPPED', message: 'Previous sync cycle still active' };
  }

  const startTime = new Date();
  logger.info('====================================================');
  logger.info(`   STARTING 5-MINUTE SYNC CYCLE at ${startTime.toISOString()}`);
  logger.info('====================================================');

  try {
    const result = await runFullBackfill();
    const nowIso = new Date().toISOString();
    setSyncCursor('last_reconcile_timestamp', nowIso);
    logger.info(`5-Minute Sync Cycle finished successfully in ${result.durationSeconds}s.`);
    return result;
  } catch (err) {
    logger.error('Sync cycle encountered an error: %s', err.message);
    return { status: 'FAILED', error: err.message };
  } finally {
    releaseLock();
  }
}

/**
 * Initializes the node-cron scheduled sync job (Default: Every 5 Minutes)
 */
function initReconciliationCron() {
  const schedule = env.CRON_RECONCILE_SCHEDULE;
  logger.info(`Scheduling automated sync cron with pattern: "${schedule}"`);

  cron.schedule(schedule, async () => {
    try {
      await executeReconciliation();
    } catch (err) {
      logger.error('Unhandled error in sync cron cycle: %s', err.message);
      releaseLock();
    }
  });
}

module.exports = {
  executeReconciliation,
  initReconciliationCron,
  acquireLock,
  releaseLock
};
