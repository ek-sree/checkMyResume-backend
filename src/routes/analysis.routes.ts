import { Router } from 'express';
import { runAnalysis, listAnalyses, getAnalysis } from '../controllers/analysis.controller';
import { chatAboutAnalysis } from '../controllers/chat.controller';
import { requireAuth } from '../middleware/auth';
import { requireCredits } from '../middleware/usage';
import { aiLimiter } from '../middleware/rateLimit';
import { validateId } from '../middleware/validateId';

const router = Router();

router.use(requireAuth);

router.get('/', listAnalyses);
router.post('/', aiLimiter, requireCredits, runAnalysis); 
router.get('/:id', validateId('id'), getAnalysis);
router.post('/:id/chat', aiLimiter, validateId('id'), chatAboutAnalysis);

export default router;
