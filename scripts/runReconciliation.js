const { executeReconciliation } = require('../src/sync/reconcileJob');
const logger = require('../src/utils/logger');

async function main() {
  try {
    logger.info('Executing standalone Reconciliation Run...');
    const result = await executeReconciliation();
    logger.info('Reconciliation completed: %j', result);
    process.exit(0);
  } catch (err) {
    logger.error('Reconciliation failed: %s', err.stack || err.message);
    process.exit(1);
  }
}

main();
