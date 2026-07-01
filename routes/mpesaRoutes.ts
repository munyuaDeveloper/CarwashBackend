import express from 'express';
import authController from '../controllers/authController';
import mpesaController from '../controllers/mpesaController';

const router = express.Router();

router.use(authController.protect);

router.get(
  '/config/:businessId',
  authController.restrictTo('system_admin', 'admin'),
  mpesaController.getMpesaConfig
);

router.patch(
  '/config/:businessId',
  authController.restrictTo('system_admin', 'admin'),
  mpesaController.updateMpesaConfig
);

router.post(
  '/config/:businessId/verify',
  authController.restrictTo('system_admin', 'admin'),
  mpesaController.verifyMpesaConfig
);

router.get(
  '/config',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  mpesaController.getMpesaConfig
);

router.get(
  '/transactions',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  mpesaController.listTransactions
);

router.get(
  '/transactions/:id',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  mpesaController.getTransaction
);

router.post(
  '/transactions/:id/query',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  mpesaController.queryTransaction
);

router.post(
  '/stk-push',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  mpesaController.initiateStkPush
);

router.get(
  '/bookings/:bookingId/payment-status',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  mpesaController.getBookingPaymentStatus
);

export default router;
