import type { Request, Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import { z } from 'zod';
import { User, type IUser, type IUserMethods } from '../models/User';
import { Payment } from '../models/Payment';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { env } from '../config/env';
import { PLANS, PAID_PLANS, getPlan, type Plan } from '../config/plans';
import { createCheckoutSession, verifyWebhookSignature, cancelAtPeriodEnd, assertRazorpay } from '../services/razorpay';
import { generateInvoicePdf, makeInvoiceNumber } from '../services/invoice';
import { sendInvoiceEmail } from '../services/email';
import { logger } from '../utils/logger';

type UserDoc = HydratedDocument<IUser, IUserMethods>;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

type RazorpayWebhookPayload = {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        method?: string;
        status?: string;
        notes?: {
          userId?: string;
          plan?: string;
        };
      };
    };
    order: {
      entity?: {
        id?: string;
        method?: string;
        status?: string;
        notes?: {
          userId?: string;
          plan?: string;
        };
      };
    };
    invoice?: {
      entity?: {
        id?: string;
        notes?: {
          userId?: string;
          plan?: string;
        };
      };
    };
    subscription?: {
      entity?: {
        id?: string;
        status?: string;
        notes?: {
          userId?: string;
          plan?: string;
        };
      };
    };
    payment_link?: {
      entity?: {
        id?: string;
        status?: string;
        notes?: {
          userId?: string;
          plan?: string;
        };
      };
    };
  };
};

/** Create a payment record, generate its invoice PDF, and email it. */
async function recordPayment(
  user: UserDoc,
  plan: Plan,
  method: 'card' | 'upi' | 'demo',
  providerReferenceId: string | null
): Promise<void> {
  const def = getPlan(plan);
  if (def.price <= 0) return;

  if (providerReferenceId) {
    const existing = await Payment.findOne({ providerReferenceId, user: user._id });
    if (existing) {
      logger.info(`Payment already recorded for providerReferenceId ${providerReferenceId}`);
      return;
    }
  }

  const payment = await Payment.create({
    user: user._id,
    plan,
    planName: def.name,
    amount: def.price,
    currency: 'INR',
    method,
    invoiceNumber: makeInvoiceNumber(),
    periodLabel: 'Monthly subscription',
    providerReferenceId,
  });

  try {
    const pdf = await generateInvoicePdf(payment, { name: user.name, email: user.email });
    await sendInvoiceEmail(user.email, user.name, payment, pdf);
  } catch (err) {
    logger.warn('Invoice email failed:', (err as Error).message);
  }
}

async function activateUserPlan(userId: string, plan: Plan, providerReferenceId: string | null, method: 'card' | 'upi' | 'demo'): Promise<void> {
  const user = await User.findById(userId);
  if (!user) return;

  user.plan = plan;
  user.credits = getPlan(plan).credits;
  user.creditsResetAt = new Date(Date.now() + MONTH_MS);
  user.subscriptionStatus = 'active';
  await user.save();

  await recordPayment(user, plan, method, providerReferenceId);
  logger.info(`Activated user ${userId} to ${plan} via Razorpay confirmation`);
}

function publicPlan(p: (typeof PLANS)[Plan]) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    tagline: p.tagline,
    credits: p.credits,
    unlimitedCredits: p.unlimitedCredits,
    maxResumes: p.maxResumes,
    chatLimit: p.chatLimit,
    unlimitedChat: p.unlimitedChat,
    features: p.features,
    priority: p.priority,
    highlights: p.highlights,
  };
}

/** GET /billing/plans — public pricing catalog. */
export const getPlans = asyncHandler(async (_req, res) => {
  res.json({
    plans: (Object.values(PLANS) as (typeof PLANS)[Plan][]).map(publicPlan),
    billingEnabled: env.razorpay.enabled,
  });
});

/** GET /billing/status — the signed-in user's plan + remaining credits. */
export const getBillingStatus = asyncHandler(async (req, res) => {
  const user = req.user!;
  const plan = getPlan(user.plan);
  res.json({
    plan: user.plan,
    planName: plan.name,
    credits: user.credits,
    unlimitedCredits: plan.unlimitedCredits,
    subscriptionStatus: user.subscriptionStatus,
    billingEnabled: env.razorpay.enabled,
  });
});

const planSchema = z.object({ plan: z.enum(['starter', 'pro', 'premium']) });

/** POST /billing/checkout — start a Razorpay payment link. */
export const createCheckout = asyncHandler(async (req, res) => {
  if (!env.razorpay.enabled) {
    throw ApiError.badRequest('Razorpay checkout is not configured. Add your Razorpay key ID and secret to enable real payments.');
  }
  const { plan } = planSchema.parse(req.body);
  const user = req.user!;

  const def = getPlan(plan);
console.log('Creating checkout session for plan:', plan, 'with amount:', def.price, 'for user:', user.email);
  const url = await createCheckoutSession({
    amount: def.price,
    plan,
    customerEmail: user.email,
    userId: String(user._id),
    customerId: user.stripeCustomerId,
  });
  res.json({ url });
});

/** POST /billing/confirm-payment — verify Razorpay payment status after the success redirect. */
export const confirmPayment = asyncHandler(async (req, res) => {
  const { paymentId } = z.object({ paymentId: z.string().min(1) }).parse(req.body);
  const user = req.user!;

  if (!env.razorpay.enabled) {
    throw ApiError.badRequest('Razorpay checkout is not configured.');
  }

  const client = assertRazorpay();
  const payment = await client.payments.fetch(paymentId);
  const userId = payment.notes?.userId;
  const plan = payment.notes?.plan as Plan | undefined;

  if (!userId || !plan || !PAID_PLANS.includes(plan)) {
    throw ApiError.badRequest('Payment could not be linked to a valid plan.');
  }

  if (String(user._id) !== String(userId)) {
    throw ApiError.forbidden('This payment does not belong to the signed-in user.');
  }

  if (!['captured', 'authorized'].includes(payment.status ?? '')) {
    throw ApiError.badRequest(`Payment is not complete yet (status: ${payment.status ?? 'unknown'}).`);
  }

  const existingPayment = payment.id ? await Payment.findOne({ providerReferenceId: payment.id, user: user._id }) : null;
  if (existingPayment) {
    logger.info(`ConfirmPayment ignored duplicate Razorpay payment ${payment.id} for user ${user._id}`);
    res.json({ ok: true, plan, status: payment.status, alreadyProcessed: true });
    return;
  }

  await activateUserPlan(String(user._id), plan, payment.id ?? null, payment.method === 'upi' ? 'upi' : 'card');
  res.json({ ok: true, plan, status: payment.status });
});

/** POST /billing/dev-upgrade — instantly switch plans (DEMO / non-production only). */
export const devUpgrade = asyncHandler(async (req, res) => {
  if (env.isProd) throw ApiError.forbidden('Not available in production.');
  const { plan } = z.object({ plan: z.enum(['free', 'starter', 'pro', 'premium']) }).parse(req.body);

  const user = req.user!;
  const def = getPlan(plan as Plan);
  user.plan = plan as Plan;
  user.credits = def.credits;
  user.creditsResetAt = plan === 'free' ? null : new Date(Date.now() + MONTH_MS);
  user.subscriptionStatus = plan === 'free' ? null : 'active (demo)';
  await user.save();

  if (plan !== 'free') await recordPayment(user, plan as Plan, 'demo', null);

  res.json({ user: user.toPublicJSON() });
});

/** POST /billing/cancel — mark the current plan as canceled. */
export const cancelSubscription = asyncHandler(async (req, res) => {
  const user = req.user!;
  if (user.plan === 'free') throw ApiError.badRequest('You are on the Free plan — nothing to cancel.');

  if (env.razorpay.enabled && user.stripeSubscriptionId) {
    await cancelAtPeriodEnd(user.stripeSubscriptionId);
    user.subscriptionStatus = 'canceling';
  } else {
    user.subscriptionStatus = 'canceled (razorpay)';
    user.creditsResetAt = null;
  }
  await user.save();
  res.json({ ok: true, subscriptionStatus: user.subscriptionStatus });
});

/** GET /billing/payments — the user's payment history. */
export const listPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ user: req.user!._id }).sort({ createdAt: -1 });
  res.json({
    payments: payments.map((p) => ({
      id: p._id,
      planName: p.planName,
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      status: p.status,
      invoiceNumber: p.invoiceNumber,
      createdAt: p.createdAt,
    })),
  });
});

/** GET /billing/payments/:id/invoice — download a payment's invoice PDF. */
export const downloadInvoice = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, user: req.user!._id });
  if (!payment) throw ApiError.notFound('Payment not found');

  const pdf = await generateInvoicePdf(payment, { name: req.user!.name, email: req.user!.email });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${payment.invoiceNumber}.pdf"`);
  res.send(pdf);
});

/** POST /billing/webhook — Razorpay webhook receiver (raw body). */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  logger.info('Razorpay webhook received (raw body length: %d)------->>>>>>>', req.body.length);
  const signature = req.headers['x-razorpay-signature'];
  if (!signature || typeof signature !== 'string') {
    logger.warn('Razorpay webhook received without signature header');
    res.status(400).send('Missing x-razorpay-signature header');
    return;
  }

  const rawBody = req.body as string | Buffer;
  const bodyText = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const isValidSignature = verifyWebhookSignature(rawBody, signature);

  if (!isValidSignature) {
    if (env.nodeEnv === 'production') {
      logger.error('Razorpay webhook signature verification failed');
      res.status(400).send('Invalid signature');
      return;
    }

    logger.warn('Razorpay webhook signature verification failed in non-production mode; continuing to process payload for debugging');
  }

  logger.info(`Razorpay webhook received: ${bodyText.slice(0, 500)}`);

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(bodyText);
  } catch (err) {
    logger.error('Razorpay webhook payload parse failed:', (err as Error).message);
    res.status(400).send('Invalid payload');
    return;
  }

  logger.info(`Razorpay webhook event: ${payload.event}`);
  try {
    switch (payload.event) {
      case 'payment.captured':
      case 'payment.authorized': {
        const payment = payload.payload?.payment?.entity;
        const userId = payment?.notes?.userId;
        const plan = payment?.notes?.plan as Plan | undefined;
        if (userId && plan && PAID_PLANS.includes(plan)) {
          await activateUserPlan(userId, plan, payment?.id ?? null, payment?.method === 'upi' ? 'upi' : 'card');
        }
        break;
      }
      case 'invoice.paid': {
        const invoice = payload.payload?.invoice?.entity;
        const userId = invoice?.notes?.userId;
        const plan = invoice?.notes?.plan as Plan | undefined;
        if (userId && plan && PAID_PLANS.includes(plan)) {
          await activateUserPlan(userId, plan, invoice?.id ?? null, 'card');
        }
        break;
      }
      case 'payment_link.paid':
      case 'payment_link.updated': {
        const paymentEntity = payload.payload?.payment?.entity;
        const orderEntity = payload.payload?.order?.entity;
        const linkEntity = payload.payload?.payment_link?.entity;

        const userId = paymentEntity?.notes?.userId ?? orderEntity?.notes?.userId ?? linkEntity?.notes?.userId;
        const plan = (paymentEntity?.notes?.plan ?? orderEntity?.notes?.plan ?? linkEntity?.notes?.plan) as Plan | undefined;
        const providerId = paymentEntity?.id ?? orderEntity?.id ?? linkEntity?.id ?? null;
        const method = paymentEntity?.method === 'upi' ? 'upi' : 'card';
        const status = paymentEntity?.status ?? orderEntity?.status ?? linkEntity?.status;

        if (userId && plan && PAID_PLANS.includes(plan) && (status === 'paid' || status === 'captured' || status === 'authorized')) {
          logger.info(`Razorpay webhook using providerId ${providerId} for payment_link event`);
          await activateUserPlan(userId, plan, providerId, method);
        }
        break;
      }
      case 'subscription.activated': {
        const subscription = payload.payload?.subscription?.entity;
        const userId = subscription?.notes?.userId;
        const plan = subscription?.notes?.plan as Plan | undefined;
        if (userId && plan && PAID_PLANS.includes(plan)) {
          await activateUserPlan(userId, plan, subscription?.id ?? null, 'card');
        }
        break;
      }
      case 'subscription.cancelled': {
        const subscription = payload.payload?.subscription?.entity;
        const userId = subscription?.notes?.userId;
        if (userId) {
          const user = await User.findById(userId);
          if (user) {
            user.subscriptionStatus = 'canceled';
            user.creditsResetAt = null;
            await user.save();
            logger.info(`Razorpay webhook canceled subscription for user ${userId}`);
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    logger.error('Razorpay webhook handler error:', (err as Error).message);
  }

  res.json({ received: true });
};
