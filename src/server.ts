import app from './app';
import './services/queue';
import { connectDB } from './config/db';
import { env } from './config/env';
import { logger } from './utils/logger';
import dns from 'dns';
import { startKeepAlive } from './services/keepAlive';


async function start(): Promise<void> {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    await connectDB();
    startKeepAlive();
    app.listen(env.port, () => {
      logger.info(`checkMyResume API listening on http://localhost:${env.port}`);
      logger.info(`Environment: ${env.nodeEnv} | Model: ${env.groqModel}`);
    });
  } catch (err) {
    logger.error('Failed to start server:', (err as Error).message);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

void start();
