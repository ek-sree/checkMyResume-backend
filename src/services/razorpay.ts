import { createHmac } from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env';
import { logger } from '../utils/logger';


export const razorpay = env.razorpay.enabled ? new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret }) : null;

if (!razorpay) {
  logger.warn('Razorpay not configured — billing endpoints will use demo mode.');
}

export function assertRazorpay(): Razorpay {
  if (!razorpay) {
    throw new Error('Razorpay is not configured on this server.');
  }
  return razorpay;
}

export async function createCheckoutSession(params: {
  amount: number;
  plan: string;
  customerEmail: string;
  userId: string;
  customerId?: string | null;
}): Promise<string> {
  const client = assertRazorpay();
  const link = await client.paymentLink.create({
    amount: Math.round(params.amount * 100),
    currency: 'INR',
    description: `CheckMyResume AI ${params.plan} plan`,
    customer: {
      name: params.customerEmail.split('@')[0],
      email: params.customerEmail,
    },
    notify: { sms: false, email: true },
    reminder_enable: true,
    notes: { userId: params.userId, plan: params.plan },
    callback_url: `${env.clientUrl}/payments?success=1`,
    callback_method: 'get',
  });
  return link.short_url ?? '';
}

export async function cancelAtPeriodEnd(_subscriptionId: string): Promise<void> {
  return;
}

export function verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
  const secret = env.razorpay.webhookSecret || env.razorpay.keySecret;
  if (!secret) return false;

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}
