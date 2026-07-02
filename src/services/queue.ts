import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { sendWelcomeEmail, sendNewUserAdminEmail, sendNotificationEmail } from './email';


export type EmailJob =
  | { type: 'welcome'; to: string; name: string }
  | { type: 'admin-new-user'; user: { name: string; email: string; plan: string; provider: string } }
  | { type: 'broadcast'; to: string; subject: string; message: string };

async function handleEmailJob(data: EmailJob): Promise<void> {
  switch (data.type) {
    case 'welcome':
      await sendWelcomeEmail(data.to, data.name);
      break;
    case 'admin-new-user':
      await sendNewUserAdminEmail(env.adminEmails, data.user);
      break;
    case 'broadcast':
      await sendNotificationEmail(data.to, data.subject, data.message);
      break;
  }
}

let queue: Queue | null = null;

if (env.redisUrl) {

  const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null }) as unknown as ConnectionOptions;
  queue = new Queue('emails', { connection });

  const worker = new Worker('emails', (job: Job) => handleEmailJob(job.data as EmailJob), {
    connection,
    concurrency: 5,
    limiter: { max: 20, duration: 1000 }, 
  });
  worker.on('failed', (job, err) => logger.warn(`Email job ${job?.id} failed:`, err.message));
  logger.info('BullMQ email queue + worker started (Redis-backed).');
} else {
  logger.info('No Redis — email jobs run in-process after the response (fire-and-forget).');
}

export async function enqueueEmail(job: EmailJob): Promise<void> {
  if (queue) {
    try {
      await queue.add('email', job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 200,
      });
      return;
    } catch (err) {
      logger.warn('enqueue failed, sending inline:', (err as Error).message);
    }
  }
  setImmediate(() => {
    void handleEmailJob(job).catch((e) => logger.warn('Email job failed:', (e as Error).message));
  });
}
