import { Router } from 'express';
import {
  register,
  login,
  googleAuth,
  refresh,
  me,
  logout,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
  requestEmailChange,
  verifyEmailChange,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleAuth);
router.post('/verify-otp', authLimiter, verifyOtp);
router.post('/resend-otp', authLimiter, resendOtp);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.post('/refresh', refresh);
router.post('/logout', logout);

router.get('/me', requireAuth, me);
router.patch('/profile', requireAuth, updateProfile);
router.post('/change-password', requireAuth, authLimiter, changePassword);
router.post('/change-email/request', requireAuth, authLimiter, requestEmailChange);
router.post('/change-email/verify', requireAuth, authLimiter, verifyEmailChange);

export default router;
