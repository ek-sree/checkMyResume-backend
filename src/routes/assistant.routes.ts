import { Router } from 'express';
import { assistantChat } from '../controllers/assistant.controller';
import { assistantLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/chat', assistantLimiter, assistantChat);

export default router;
