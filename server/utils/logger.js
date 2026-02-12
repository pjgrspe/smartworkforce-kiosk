/**
 * Winston Logger Configuration
 */

const winston = require('winston');
const path = require('path');
const { LOG_CONFIG } = require('../config/constants');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: LOG_CONFIG.LEVEL,
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(__dirname, '../../', LOG_CONFIG.FILE_PATH),
      maxsize: LOG_CONFIG.MAX_SIZE,
      maxFiles: LOG_CONFIG.MAX_FILES,
      tailable: true
    }),
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs', 'error.log'),
      level: 'error',
      maxsize: LOG_CONFIG.MAX_SIZE,
      maxFiles: LOG_CONFIG.MAX_FILES
    })
  ]
});

// Add stream for Morgan (if using with Express)
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = logger;
