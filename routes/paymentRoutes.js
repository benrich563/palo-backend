import express from 'express';
import PaymentController from '../controllers/PaymentController.js';
import { auth, requireRole } from '../middleware/auth.js';
import { validatePaymentInit, validateRefund } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Protected routes (require authentication)
router.use(auth);

// Payment initialization and verification
router.post(
  '/initialize',
  validatePaymentInit,
  PaymentController.initializePayment
);

router.get(
  '/verify/:reference',
  PaymentController.verifyPayment
);

// Payment history and stats
router.get(
  '/history',
  PaymentController.getPaymentHistory
);

router.get(
  '/stats',
  requireRole('ADMIN', 'BUSINESS'),
  PaymentController.getPaymentStats
);

// Refund routes (admin only)
router.post(
  '/refund/:paymentId',
  requireRole('ADMIN'),
  validateRefund,
  PaymentController.initiateRefund
);

// Webhook route for Paystack
router.post(
  '/webhook',
  PaymentController.handlePaystackWebhook
);

export default router;



