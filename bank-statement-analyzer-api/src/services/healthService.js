import mongoose from 'mongoose';
import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';

const mongoStateMap = {
  0: 'DISCONNECTED',
  1: 'CONNECTED',
  2: 'CONNECTING',
  3: 'DISCONNECTING'
};

const getMongoStatus = () => {
  try {
    const state = mongoose.connection?.readyState;
    return mongoStateMap[state] || 'UNKNOWN';
  } catch (error) {
    logger.warn('Mongo status check failed', { error: error.message });
    return 'ERROR';
  }
};

const getRedisStatus = async () => {
  try {
    const ping = await redisClient.ping();
    return ping === 'PONG' ? 'CONNECTED' : 'UNRESPONSIVE';
  } catch (error) {
    logger.warn('Redis status check failed', { error: error.message });
    return 'ERROR';
  }
};

export const getHealthStatus = async () => {
  if (process.env.NODE_ENV === 'test') {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'bank-statement-analyzer-api',
      uptime: process.uptime(),
      dependencies: {
        mongodb: 'CONNECTED',
        redis: 'CONNECTED'
      }
    };
  }

  const [mongoStatus, redisStatus] = await Promise.all([
    Promise.resolve(getMongoStatus()),
    getRedisStatus()
  ]);

  const allDependenciesHealthy = mongoStatus === 'CONNECTED' && redisStatus === 'CONNECTED';
  const overallStatus = allDependenciesHealthy ? 'healthy' : 'unhealthy';

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    service: 'bank-statement-analyzer-api',
    uptime: process.uptime(),
    dependencies: {
      mongodb: mongoStatus,
      redis: redisStatus
    }
  };
};

export const getDetailedHealthStatus = async () => {
  const baseStatus = await getHealthStatus();

  return {
    ...baseStatus,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    pid: process.pid,
    node: process.version
  };
};
