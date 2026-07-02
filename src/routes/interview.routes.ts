import { Router } from 'express';
import {
  startInterview,
  answerQuestion,
  listInterviews,
  getInterview,
} from '../controllers/interview.controller';
import { requireAuth } from '../middleware/auth';
import { requireCredits, requireFeature } from '../middleware/usage';
import { aiLimiter } from '../middleware/rateLimit';
import { validateId } from '../middleware/validateId';

const router = Router();

router.use(requireAuth);

router.get('/', listInterviews);
router.post('/', aiLimiter, requireFeature('interviews'), requireCredits, startInterview);
router.get('/:id', validateId('id'), getInterview);
router.post('/:id/turns/:turnId/answer', aiLimiter, validateId('id', 'turnId'), answerQuestion);

export default router;
