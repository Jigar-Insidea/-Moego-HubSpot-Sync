const express = require('express');
const env = require('./config/env');
const logger = require('./utils/logger');
const { initReconciliationCron } = require('./sync/reconcileJob');
const webhookRoutes = require('./routes/webhookRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  if (req.path !== '/health') {
    logger.info(`${req.method} ${req.path}`);
  }
  next();
});

// Register routes
app.use('/', apiRoutes);
app.use('/webhooks/moego', webhookRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('Unhandled server error on %s %s: %s', req.method, req.path, err.stack || err.message);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start Server
const server = app.listen(env.PORT, () => {
  logger.info('====================================================');
  logger.info(`🚀 MoeGo <-> HubSpot Sync Middleware Service Running`);
  logger.info(`Port: ${env.PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`HubSpot Portal ID: ${env.HUBSPOT_PORTAL_ID}`);
  logger.info(`MoeGo Company ID: ${env.MOEGO_COMPANY_ID}`);
  logger.info('====================================================');

  // Initialize Scheduled Cron
  initReconciliationCron();
});

// Graceful Shutdown
function shutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
