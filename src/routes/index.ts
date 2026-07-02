import { Router } from 'express';
import authRoutes from './auth.routes';
import resumeRoutes from './resume.routes';
import analysisRoutes from './analysis.routes';
import comparisonRoutes from './comparison.routes';
import interviewRoutes from './interview.routes';
import billingRoutes from './billing.routes';
import analyticsRoutes from './analytics.routes';
import assistantRoutes from './assistant.routes';
import contactRoutes from './contact.routes';
import adminRoutes from './admin.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'career-forge-api' });
});

router.use('/auth', authRoutes);
router.use('/resumes', resumeRoutes);
router.use('/analyses', analysisRoutes);
router.use('/comparisons', comparisonRoutes);
router.use('/interviews', interviewRoutes);
router.use('/billing', billingRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/assistant', assistantRoutes); 
router.use('/contact', contactRoutes);
router.use('/admin', adminRoutes);

export default router;
