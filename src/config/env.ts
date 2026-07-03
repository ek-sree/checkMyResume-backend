import dotenv from 'dotenv';

dotenv.config();


const required = [
  'MONGODB_URI',
  'JWT_SECRET',
  'GROQ_API_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'BREVO_API_KEY',
] as const;

const missing = required.filter((key) => !process.env[key]);
if (missing.length && process.env.NODE_ENV === 'production') {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  appUrl: process.env.APP_URL || 'http://localhost:5000',

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/career-forge',

  jwtSecret: process.env.JWT_SECRET || 'asdna35234nasjdiiosda992e',
  accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTtl: process.env.REFRESH_TOKEN_TTL || '7d',

  appName: process.env.APP_NAME || 'CareerForge AI',
  maxResumes: Number(process.env.MAX_RESUMES) || 5,

  adminEmails: (process.env.ADMIN_EMAILS || 'checkmyresume105@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  groqApiKey: process.env.GROQ_API_KEY || '',
  groqBaseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

  freeCredits: Number(process.env.FREE_CREDITS) || 5,
  chatFreeLimit: Number(process.env.CHAT_FREE_LIMIT) || 4,

  redisUrl: process.env.REDIS_URL || '',

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    enabled: Boolean(process.env.GOOGLE_CLIENT_ID),
  },

  email: {
    from: process.env.EMAIL_FROM || 'CheckMyResume AI <checkmyresume105@gmail.com>',
    apiKey: process.env.BREVO_API_KEY || '',
    enabled: Boolean(process.env.BREVO_API_KEY),
  },

  contactEmail: process.env.CONTACT_EMAIL || 'sreeharisree105@gmail.com',

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    starterPlanId: process.env.RAZORPAY_PLAN_STARTER || '',
    proPlanId: process.env.RAZORPAY_PLAN_PRO || '',
    premiumPlanId: process.env.RAZORPAY_PLAN_PREMIUM || '',
    enabled: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
  },
} as const;
