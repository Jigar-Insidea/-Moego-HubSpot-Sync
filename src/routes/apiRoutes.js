const express = require('express');
const { syncCustomerBundle, runFullBackfill } = require('../sync/syncEngine');
const { executeReconciliation } = require('../sync/reconcileJob');
const { getSyncCursor, getSyncHistory } = require('../storage/stateStore');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Health check endpoint for Render monitoring
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'HEALTHY',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    service: 'moego-hubspot-sync'
  });
});

/**
 * System sync status and metrics
 */
router.get('/status', (req, res) => {
  const lastBackfill = getSyncCursor('last_backfill_completed_at', 'None');
  const lastReconcile = getSyncCursor('last_reconcile_timestamp', 'None');
  const history = getSyncHistory(10);

  res.status(200).json({
    lastBackfillCompletedAt: lastBackfill,
    lastReconciliationAt: lastReconcile,
    recentSyncHistory: history
  });
});

/**
 * Manually trigger a full customer bundle sync
 */
router.post('/api/sync/customer/:id', async (req, res) => {
  const customerId = req.params.id;
  try {
    const result = await syncCustomerBundle(customerId);
    res.status(200).json({ status: 'SUCCESS', result });
  } catch (err) {
    logger.error('Manual sync failed for customer %s: %s', customerId, err.message);
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

/**
 * Manually trigger reconciliation job
 */
router.post('/api/sync/reconcile', async (req, res) => {
  res.status(202).json({ status: 'TRIGGERED', message: 'Reconciliation job started in background' });
  executeReconciliation().catch(err => {
    logger.error('Background reconciliation job failed: %s', err.message);
  });
});

/**
 * Manually trigger full historical backfill
 */
router.post('/api/sync/full', async (req, res) => {
  res.status(202).json({ status: 'TRIGGERED', message: 'Full historical backfill started in background' });
  runFullBackfill().catch(err => {
    logger.error('Background full backfill failed: %s', err.message);
  });
});

module.exports = router;
