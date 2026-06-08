const morgan = require('morgan');
const logger = require('../../utils/logger');

const requestLogger = morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
});

const logRequest = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    }
  });

  next();
};

module.exports = { requestLogger, logRequest };