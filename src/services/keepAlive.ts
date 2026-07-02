import axios from 'axios';
import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export function startKeepAlive(): void {
  cron.schedule('*/10 * * * *', async () => {
    try {
      const url = env.isProd 
        ? `https://${env.appUrl}/health` 
        : `http://localhost:${env.port}/health`;
      
      await axios.get(url, { timeout: 5000 });
      logger.debug('Keep-alive ping successful');
    } catch (err) {
      logger.error('Keep-alive ping failed:', (err as Error).message);
    }
  });

  logger.info('Keep-alive cron job started (every 5 minutes)');
}