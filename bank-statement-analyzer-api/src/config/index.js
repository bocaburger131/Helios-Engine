/**
 * Main configuration module
 */
import { config as envConfig } from './env.js';

// Export the config object
export const config = envConfig;

// Export for backward compatibility
export default envConfig;