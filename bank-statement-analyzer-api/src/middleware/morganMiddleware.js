import morgan from 'morgan';
import logger from '../utils/logger.js';

// Create a stream object with a 'write' function that will be used by `morgan`
const stream = {
  write: (message) => {
    // Use the 'info' level so the output will be picked up by winston transports
    logger.http(message.trim());
  },
};

// Skip all the Morgan http log if the application is not running in development mode.
const skip = () => {
  const env = process.env.NODE_ENV || 'development';
  return env !== 'development';
};

// Build the morgan middleware
const morganMiddleware = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  { stream, skip }
);

export default morganMiddleware;