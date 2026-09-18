const { runFullBackfill } = require('../src/sync/syncEngine');
const logger = require('../src/utils/logger');

async function main() {
  try {
    logger.info('Executing standalone Full Historical Backfill...');
    const result = await runFullBackfill();
    logger.info('Backfill finished successfully: %j', result);
    process.exit(0);
  } catch (err) {
    logger.error('Backfill failed: %s', err.stack || err.message);
    process.exit(1);
  }
}

main();
