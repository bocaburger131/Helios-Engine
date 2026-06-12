import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import path from 'path';
import logger from './logger.js';

export async function loadRoute(app, routePath, mountPath) {
  try {
    const fullPath = path.resolve(routePath);
    
    if (!existsSync(fullPath)) {
      logger.warn(`Route file not found: ${routePath}`);
      return false;
    }
    
    const routeModule = await import(pathToFileURL(fullPath).href);
    app.use(mountPath, routeModule.default);
    logger.info(`✅ Loaded route: ${mountPath} -> ${routePath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to load route ${routePath}:`, error.message);
    return false;
  }
}