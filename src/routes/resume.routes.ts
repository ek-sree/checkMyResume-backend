import { Router } from 'express';
import {
  uploadResumeFile,
  createResumeFromText,
  listResumes,
  getResume,
  deleteResume,
} from '../controllers/resume.controller';
import { requireAuth } from '../middleware/auth';
import { uploadResume } from '../middleware/upload';
import { validateId } from '../middleware/validateId';

const router = Router();

router.use(requireAuth);

router.get('/', listResumes);
router.post('/', createResumeFromText);
router.post('/upload', uploadResume, uploadResumeFile);
router.get('/:id', validateId('id'), getResume);
router.delete('/:id', validateId('id'), deleteResume);

export default router;
