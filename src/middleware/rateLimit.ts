import rateLimit, { type RateLimitRequestHandler, type Store } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { redis } from '../config/redis';
import { getPlan } from '../config/plans';


function makeLimiter(opts: {
  windowMs: number;
  max: number;
  prefix: string;
  skip?: (req: { user?: { plan: import('../config/plans').Plan } }) => boolean;
}): RateLimitRequestHandler {
  let store: Store | undefined;
  if (redis) {
    const client = redis;
    store = new RedisStore({
      prefix: `rl:${opts.prefix}:`,
      sendCommand: (...args: string[]) =>
        client.call(...(args as [string, ...string[]])) as Promise<RedisReply>,
    });
  }

  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Too many requests — please slow down and try again shortly.' } },
    ...(opts.skip ? { skip: opts.skip } : {}),
    ...(store ? { store } : {}),
  });
}

export const apiLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 300, prefix: 'api' });

export const authLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 25, prefix: 'auth' });

export const aiLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  max: 40,
  prefix: 'ai',
  skip: (req) => Boolean(req.user && getPlan(req.user.plan).priority),
});

export const assistantLimiter = makeLimiter({ windowMs: 10 * 60 * 1000, max: 40, prefix: 'assistant' });

export const contactLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, max: 8, prefix: 'contact' });
