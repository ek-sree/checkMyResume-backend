import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';


export const redis: Redis | null = env.redisUrl
  ? new Redis(env.redisUrl, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
    })
  : null;

if (redis) {
  let warned = false;
  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('ready', () => logger.info('Redis ready'));
  redis.on('error', (err) => {
    if (!warned) {
      logger.warn('Redis error (caching/rate-limit will degrade):', err.message);
      warned = true;
    }
  });
} else {
  logger.info('Redis not configured — using in-memory caching and rate limiting.');
}

export const redisEnabled = Boolean(redis);
