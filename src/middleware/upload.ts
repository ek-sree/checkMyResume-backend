import multer from 'multer';
import { ApiError } from '../utils/ApiError';

const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
  'text/plain',
]);


export const uploadResume = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, 
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(ApiError.badRequest('Unsupported file type. Upload a PDF, DOCX, or TXT.'));
    }
  },
}).single('resume');
