import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';


export async function connectDB(): Promise<typeof mongoose.connection> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err.message));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  return mongoose.connection;
}
