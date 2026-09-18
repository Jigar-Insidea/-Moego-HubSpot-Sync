const express = require('express');
const { syncCustomerBundle } = require('../sync/syncEngine');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Generic webhook handler for all MoeGo events (Customer, Pet, Appointment, Order)
 */
router.post('/all', async (req, res) => {
  const payload = req.body || {};
  logger.info('Received MoeGo Webhook Event: %j', {
    eventType: payload.eventType || payload.type || 'UNKNOWN',
    resourceId: payload.id || payload.customerId || payload.resourceId
  });

  // Acknowledge webhook immediately
  res.status(200).json({ status: 'ACKNOWLEDGED', receivedAt: new Date().toISOString() });

  // Asynchronously process customer bundle if customerId is identified
  const customerId = payload.customerId || (payload.type === 'CUSTOMER' ? payload.id : null);
  if (customerId) {
    try {
      await syncCustomerBundle(customerId);
    } catch (err) {
      logger.error('Error processing webhook for customer %s: %s', customerId, err.message);
    }
  }
});

/**
 * Webhook for Customer CRUD events
 */
router.post('/customer', async (req, res) => {
  const payload = req.body || {};
  const customerId = payload.id || payload.customerId;
  logger.info('Received Customer Webhook for ID: %s', customerId);

  res.status(200).json({ status: 'ACKNOWLEDGED' });

  if (customerId) {
    try {
      await syncCustomerBundle(customerId);
    } catch (err) {
      logger.error('Failed to sync customer bundle from webhook: %s', err.message);
    }
  }
});

/**
 * Webhook for Pet CRUD events
 */
router.post('/pet', async (req, res) => {
  const payload = req.body || {};
  const customerId = payload.customerId;
  logger.info('Received Pet Webhook (Pet ID: %s, Customer ID: %s)', payload.id, customerId);

  res.status(200).json({ status: 'ACKNOWLEDGED' });

  if (customerId) {
    try {
      await syncCustomerBundle(customerId);
    } catch (err) {
      logger.error('Failed to sync customer bundle from pet webhook: %s', err.message);
    }
  }
});

/**
 * Webhook for Appointment CRUD events
 */
router.post('/appointment', async (req, res) => {
  const payload = req.body || {};
  const customerId = payload.customerId;
  logger.info('Received Appointment Webhook (Appt ID: %s, Customer ID: %s)', payload.id, customerId);

  res.status(200).json({ status: 'ACKNOWLEDGED' });

  if (customerId) {
    try {
      await syncCustomerBundle(customerId);
    } catch (err) {
      logger.error('Failed to sync customer bundle from appointment webhook: %s', err.message);
    }
  }
});

module.exports = router;
