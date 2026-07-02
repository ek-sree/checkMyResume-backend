import { Router } from 'express';
import { getAnalytics } from '../controllers/analytics.controller';
import { requireAuth } from '../middleware/auth';
import { requireFeature } from '../middleware/usage';

const router = Router();

router.use(requireAuth);
router.get('/', requireFeature('analytics'), getAnalytics);

export default router;
