const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `[${timestamp}] [${level.toUpperCase()}]: ${stack || message}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger;
