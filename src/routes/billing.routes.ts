import { Router } from 'express';
import {
  getPlans,
  getBillingStatus,
  createCheckout,
  confirmPayment,
  devUpgrade,
  cancelSubscription,
  listPayments,
  downloadInvoice,
} from '../controllers/billing.controller';
import { requireAuth } from '../middleware/auth';
import { validateId } from '../middleware/validateId';

const router = Router();

router.get('/plans', getPlans);

router.use(requireAuth);
router.get('/status', getBillingStatus);
router.post('/checkout', createCheckout);
// router.post('/confirm-payment', confirmPayment);
router.post('/dev-upgrade', devUpgrade);
router.post('/cancel', cancelSubscription);
router.get('/payments', listPayments);
router.get('/payments/:id/invoice', validateId('id'), downloadInvoice);


export default router;
