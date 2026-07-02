import { Router } from 'express';
import { submitContact } from '../controllers/contact.controller';
import { contactLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/', contactLimiter, submitContact);

export default router;
