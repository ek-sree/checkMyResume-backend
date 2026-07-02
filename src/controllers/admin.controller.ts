import { z } from 'zod';
import type { HydratedDocument } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { User, type IUser, type IUserMethods } from '../models/User';
import { Resume } from '../models/Resume';
import { Analysis } from '../models/Analysis';
import { InterviewSession } from '../models/InterviewSession';
import { Comparison } from '../models/Comparison';
import { Payment } from '../models/Payment';
import { ContactMessage } from '../models/ContactMessage';
import { getPlan, type Plan } from '../config/plans';
import { enqueueEmail } from '../services/queue';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function adminUserView(u: HydratedDocument<IUser, IUserMethods>) {
  return {
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    plan: u.plan,
    credits: u.credits,
    blocked: u.blocked,
    emailVerified: u.emailVerified,
    authProvider: u.authProvider,
    tokensUsed: u.tokensUsed,
    aiRuns: u.aiRuns,
    subscriptionStatus: u.subscriptionStatus,
    createdAt: u.createdAt,
  };
}

export const overview = asyncHandler(async (_req, res) => {
  const [users, blocked, admins, resumes, analyses, interviews, comparisons, payments, contactsUnread] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ blocked: true }),
      User.countDocuments({ role: 'admin' }),
      Resume.countDocuments({}),
      Analysis.countDocuments({}),
      InterviewSession.countDocuments({}),
      Comparison.countDocuments({}),
      Payment.countDocuments({}),
      ContactMessage.countDocuments({ read: false }),
    ]);

  const [revenueAgg, usageAgg, planAgg] = await Promise.all([
    Payment.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    User.aggregate([{ $group: { _id: null, tokens: { $sum: '$tokensUsed' }, runs: { $sum: '$aiRuns' } } }]),
    User.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
  ]);

  const planDistribution: Record<string, number> = { free: 0, starter: 0, pro: 0, premium: 0 };
  for (const p of planAgg as { _id: string; count: number }[]) planDistribution[p._id] = p.count;


  const paidUsers = await User.find({ plan: { $ne: 'free' } }).select('plan subscriptionStatus');
  const mrr = paidUsers
    .filter((u) => u.subscriptionStatus !== 'canceled' && u.subscriptionStatus !== 'canceled (demo)')
    .reduce((sum, u) => sum + getPlan(u.plan).price, 0);

  const recentUsers = await User.find({})
    .sort({ createdAt: -1 })
    .limit(6)
    .select('name email plan createdAt blocked');

  res.json({
    totals: { users, blocked, admins, resumes, analyses, interviews, comparisons, payments },
    revenue: revenueAgg[0]?.total ?? 0,
    mrr,
    tokensUsed: usageAgg[0]?.tokens ?? 0,
    aiRuns: usageAgg[0]?.runs ?? 0,
    planDistribution,
    contactsUnread,
    recentUsers: recentUsers.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      plan: u.plan,
      blocked: u.blocked,
      createdAt: u.createdAt,
    })),
  });
});

export const listUsers = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = q
    ? { $or: [{ email: new RegExp(q, 'i') }, { name: new RegExp(q, 'i') }] }
    : {};
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json({ users: users.map(adminUserView) });
});


export const getUserDetail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const [payments, resumes, analyses, interviews, comparisons] = await Promise.all([
    Payment.find({ user: user._id }).sort({ createdAt: -1 }),
    Resume.find({ user: user._id }).sort({ createdAt: -1 }).select('label sourceType createdAt'),
    Analysis.countDocuments({ user: user._id }),
    InterviewSession.countDocuments({ user: user._id }),
    Comparison.countDocuments({ user: user._id }),
  ]);

  res.json({
    user: adminUserView(user),
    counts: { analyses, interviews, comparisons, resumes: resumes.length },
    resumes: resumes.map((r) => ({ id: r._id, label: r.label, sourceType: r.sourceType, createdAt: r.createdAt })),
    payments: payments.map((p) => ({
      id: p._id,
      planName: p.planName,
      amount: p.amount,
      method: p.method,
      invoiceNumber: p.invoiceNumber,
      createdAt: p.createdAt,
    })),
  });
});


export const setBlocked = asyncHandler(async (req, res) => {
  const { blocked } = z.object({ blocked: z.boolean() }).parse(req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'admin') throw ApiError.badRequest('You cannot block an admin account.');

  user.blocked = blocked;
  if (blocked) user.tokenVersion += 1; // force sign-out
  await user.save();
  res.json({ user: adminUserView(user) });
});


export const setUserPlan = asyncHandler(async (req, res) => {
  const { plan } = z.object({ plan: z.enum(['free', 'starter', 'pro', 'premium']) }).parse(req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  user.plan = plan as Plan;
  user.credits = getPlan(plan).credits;
  user.creditsResetAt = plan === 'free' ? null : new Date(Date.now() + MONTH_MS);
  user.subscriptionStatus = plan === 'free' ? null : 'active (admin)';
  await user.save();
  res.json({ user: adminUserView(user) });
});


export const listAllPayments = asyncHandler(async (_req, res) => {
  const payments = await Payment.find({})
    .sort({ createdAt: -1 })
    .limit(300)
    .populate<{ user: { name: string; email: string } }>('user', 'name email');
  res.json({
    payments: payments.map((p) => ({
      id: p._id,
      user: p.user ? { name: p.user.name, email: p.user.email } : null,
      planName: p.planName,
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      invoiceNumber: p.invoiceNumber,
      createdAt: p.createdAt,
    })),
  });
});


export const listContacts = asyncHandler(async (_req, res) => {
  const messages = await ContactMessage.find({}).sort({ createdAt: -1 }).limit(300);
  res.json({
    messages: messages.map((m) => ({
      id: m._id,
      name: m.name,
      email: m.email,
      message: m.message,
      read: m.read,
      createdAt: m.createdAt,
    })),
  });
});


export const sendNotification = asyncHandler(async (req, res) => {
  const { subject, message, audience, userIds } = z
    .object({
      subject: z.string().min(1).max(160),
      message: z.string().min(1).max(5000),
      audience: z.enum(['all', 'selected']),
      userIds: z.array(z.string()).optional(),
    })
    .parse(req.body);

  let recipients;
  if (audience === 'all') {
    recipients = await User.find({ blocked: false }).select('email');
  } else {
    const ids = userIds ?? [];
    if (!ids.length) throw ApiError.badRequest('Select at least one user.');
    recipients = await User.find({ _id: { $in: ids }, blocked: false }).select('email');
  }


  for (const r of recipients) {
    void enqueueEmail({ type: 'broadcast', to: r.email, subject, message });
  }

  res.json({ queued: recipients.length });
});

export const markContactRead = asyncHandler(async (req, res) => {
  const msg = await ContactMessage.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
  if (!msg) throw ApiError.notFound('Message not found');
  res.json({ ok: true });
});
