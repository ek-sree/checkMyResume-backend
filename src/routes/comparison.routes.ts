import { Router } from 'express';
import { runComparison, listComparisons, getComparison } from '../controllers/comparison.controller';
import { requireAuth } from '../middleware/auth';
import { requireCredits, requireFeature } from '../middleware/usage';
import { aiLimiter } from '../middleware/rateLimit';
import { validateId } from '../middleware/validateId';

const router = Router();

router.use(requireAuth);

router.get('/', listComparisons);
router.post('/', aiLimiter, requireFeature('compare'), requireCredits, runComparison); // streams SSE
router.get('/:id', validateId('id'), getComparison);

export default router;
