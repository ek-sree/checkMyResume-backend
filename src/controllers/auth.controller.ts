import type { Response } from 'express';
import { z } from 'zod';
import type { HydratedDocument } from 'mongoose';
import { User, type IUser, type IUserMethods } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/token';
import { env } from '../config/env';
import { verifyGoogleIdToken } from '../services/google';
import { sendOtpEmail } from '../services/email';
import { enqueueEmail } from '../services/queue';
import { issueOtp, checkOtp } from '../services/otp';

type UserDoc = HydratedDocument<IUser, IUserMethods>;

const ACCESS_COOKIE = 'at';
const REFRESH_COOKIE = 'rt';
const REFRESH_PATH = '/api/auth';
const baseCookie = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? ('none' as const) : ('lax' as const),
};

function setAuthCookies(res: Response, user: UserDoc): void {
  res.cookie(ACCESS_COOKIE, signAccessToken(user), { ...baseCookie, maxAge: 15 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, signRefreshToken(user), {
    ...baseCookie,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: REFRESH_PATH,
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseCookie);
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie, path: REFRESH_PATH });
}

function applyAdminRole(user: UserDoc): boolean {
  if (env.adminEmails.includes(user.email.toLowerCase()) && user.role !== 'admin') {
    user.role = 'admin';
    return true;
  }
  return false;
}


const registerSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = registerSchema.parse(req.body);

  let user = await User.findOne({ email });
  if (user && user.emailVerified) throw ApiError.badRequest('An account with this email already exists');


  if (!user) user = new User({ name, email, authProvider: 'local', emailVerified: false });
  else user.name = name;
  await user.setPassword(password);
  await user.save();

  const code = await issueOtp(email, 'verify');
  await sendOtpEmail(email, code, 'verify');

  res.status(201).json({ needsVerification: true, email });
});

const verifyOtpSchema = z.object({ email: z.string().email(), code: z.string().length(4) });

export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, code } = verifyOtpSchema.parse(req.body);
  const { ok } = await checkOtp(email, 'verify', code);
  if (!ok) throw ApiError.badRequest('Invalid or expired code');

  const user = await User.findOne({ email });
  if (!user) throw ApiError.badRequest('Account not found');

  user.emailVerified = true;
  applyAdminRole(user);
  await user.save();

  setAuthCookies(res, user);
  void enqueueEmail({ type: 'welcome', to: user.email, name: user.name });
  void enqueueEmail({
    type: 'admin-new-user',
    user: { name: user.name, email: user.email, plan: user.plan, provider: 'email' },
  });
  res.json({ user: user.toPublicJSON() });
});

const emailSchema = z.object({ email: z.string().email() });

export const resendOtp = asyncHandler(async (req, res) => {
  const { email } = emailSchema.parse(req.body);
  const user = await User.findOne({ email });
  if (user && !user.emailVerified && user.authProvider === 'local') {
    const code = await issueOtp(email, 'verify');
    await sendOtpEmail(email, code, 'verify');
  }
  res.json({ ok: true });
});

// ── Login ────────────────────────────────────────────────────────────────────

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await user.verifyPassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.authProvider === 'local' && !user.emailVerified) {
    const code = await issueOtp(email, 'verify');
    await sendOtpEmail(email, code, 'verify');
    throw ApiError.forbidden('EMAIL_NOT_VERIFIED');
  }

  if (applyAdminRole(user)) await user.save();
  setAuthCookies(res, user);
  res.json({ user: user.toPublicJSON() });
});


const googleSchema = z.object({ idToken: z.string().min(10) });

export const googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = googleSchema.parse(req.body);
  const profile = await verifyGoogleIdToken(idToken);

  let user = await User.findOne({ $or: [{ googleId: profile.googleId }, { email: profile.email }] });
  let isNew = false;

  if (!user) {
    user = await User.create({
      name: profile.name,
      email: profile.email,
      authProvider: 'google',
      googleId: profile.googleId,
      avatar: profile.avatar ?? null,
      emailVerified: true,
    });
    isNew = true;
    if (applyAdminRole(user)) await user.save();
  } else {
    if (!user.googleId) user.googleId = profile.googleId;
    if (!user.avatar && profile.avatar) user.avatar = profile.avatar;
    user.emailVerified = true;
    applyAdminRole(user);
    await user.save();
  }

  setAuthCookies(res, user);
  if (isNew) {
    void enqueueEmail({ type: 'welcome', to: user.email, name: user.name });
    void enqueueEmail({
      type: 'admin-new-user',
      user: { name: user.name, email: user.email, plan: user.plan, provider: 'google' },
    });
  }
  res.json({ user: user.toPublicJSON() });
});


export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = emailSchema.parse(req.body);
  const user = await User.findOne({ email });
  if (user && user.authProvider === 'local') {
    const code = await issueOtp(email, 'reset');
    await sendOtpEmail(email, code, 'reset');
  }
  res.json({ ok: true }); 
});

const resetSchema = z.object({
  email: z.string().email(),
  code: z.string().length(4),
  password: z.string().min(8),
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, password } = resetSchema.parse(req.body);
  const { ok } = await checkOtp(email, 'reset', code);
  if (!ok) throw ApiError.badRequest('Invalid or expired code');

  const user = await User.findOne({ email });
  if (!user) throw ApiError.badRequest('Account not found');

  await user.setPassword(password);
  user.emailVerified = true;
  user.tokenVersion += 1; 
  await user.save();

  res.json({ ok: true });
});


export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.rt;
  if (!token) throw ApiError.unauthorized('No refresh token');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Refresh token expired');
  }
  if (payload.type !== 'refresh') {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Invalid refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.tokenVersion !== payload.tv) {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Session revoked');
  }

  setAuthCookies(res, user);
  res.json({ user: user.toPublicJSON() });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user!.toPublicJSON() });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.rt || req.cookies?.at;
  if (token) {
    try {
      const payload = verifyToken(token);
      await User.findByIdAndUpdate(payload.sub, { $inc: { tokenVersion: 1 } });
    } catch {
    }
  }
  clearAuthCookies(res);
  res.json({ ok: true });
});


export const updateProfile = asyncHandler(async (req, res) => {
  const { name } = z.object({ name: z.string().min(1).max(80) }).parse(req.body);
  const user = req.user!;
  user.name = name;
  await user.save();
  res.json({ user: user.toPublicJSON() });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await User.findById(req.user!._id).select('+passwordHash');
  if (!user || !user.passwordHash) {
    throw ApiError.badRequest('Password change isn’t available for Google accounts.');
  }
  if (!(await user.verifyPassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect.');
  }

  await user.setPassword(newPassword);
  user.tokenVersion += 1; 
  await user.save();
  setAuthCookies(res, user);
  res.json({ ok: true });
});

const changeEmailSchema = z.object({ newEmail: z.string().email(), password: z.string().min(1) });

export const requestEmailChange = asyncHandler(async (req, res) => {
  const { newEmail, password } = changeEmailSchema.parse(req.body);
  const user = await User.findById(req.user!._id).select('+passwordHash');
  if (!user || !user.passwordHash) {
    throw ApiError.badRequest('Email change isn’t available for Google accounts.');
  }
  if (!(await user.verifyPassword(password))) {
    throw ApiError.badRequest('Your password is incorrect.');
  }

  const taken = await User.findOne({ email: newEmail.toLowerCase(), _id: { $ne: user._id } });
  if (taken) throw ApiError.badRequest('That email is already in use.');

  user.pendingEmail = newEmail.toLowerCase();
  await user.save();

  const code = await issueOtp(newEmail, 'change-email', String(user._id));
  await sendOtpEmail(newEmail, code, 'change-email');
  res.json({ ok: true, newEmail: user.pendingEmail });
});

export const verifyEmailChange = asyncHandler(async (req, res) => {
  const { code } = z.object({ code: z.string().length(4) }).parse(req.body);
  const user = req.user!;
  if (!user.pendingEmail) throw ApiError.badRequest('No pending email change.');

  const { ok } = await checkOtp(user.pendingEmail, 'change-email', code);
  if (!ok) throw ApiError.badRequest('Invalid or expired code');

  user.email = user.pendingEmail;
  user.pendingEmail = null;
  user.emailVerified = true;
  await user.save();
  res.json({ user: user.toPublicJSON() });
});
