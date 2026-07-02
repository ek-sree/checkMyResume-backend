import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import './config/redis';
import { env } from './config/env';
import router from './routes/index';
import { notFound, errorHandler } from './middleware/error';
import { mongoSanitize } from './middleware/sanitize';
import { apiLimiter } from './middleware/rateLimit';
import { handleWebhook } from './controllers/billing.controller';

const app = express();

app.set('trust proxy', 1); 

app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(morgan(env.isProd ? 'combined' : 'dev'));
app.use(cookieParser());

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleWebhook);

app.use(express.json({ limit: '1mb' }));
app.use(mongoSanitize);

app.use('/api', apiLimiter, router);

app.use(notFound);
app.use(errorHandler);

export default app;
