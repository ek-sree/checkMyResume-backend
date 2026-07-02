import { Router } from 'express';
import {
  overview,
  listUsers,
  getUserDetail,
  setBlocked,
  setUserPlan,
  listAllPayments,
  listContacts,
  markContactRead,
  sendNotification,
} from '../controllers/admin.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { validateId } from '../middleware/validateId';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/overview', overview);
router.get('/users', listUsers);
router.get('/users/:id', validateId('id'), getUserDetail);
router.post('/users/:id/block', validateId('id'), setBlocked);
router.post('/users/:id/plan', validateId('id'), setUserPlan);
router.get('/payments', listAllPayments);
router.get('/contacts', listContacts);
router.post('/contacts/:id/read', validateId('id'), markContactRead);
router.post('/notify', sendNotification);

export default router;
