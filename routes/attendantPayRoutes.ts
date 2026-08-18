import express from 'express';
import authController from '../controllers/authController';
import attendantPayController from '../controllers/attendantPayController';

const router = express.Router();

router.use(authController.protect);

router.get(
  '/settings/:businessId',
  authController.restrictTo('system_admin', 'admin'),
  attendantPayController.getSettings
);
router.patch(
  '/settings/:businessId',
  authController.restrictTo('system_admin', 'admin'),
  attendantPayController.updateSettings
);

router.get(
  '/settings',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  attendantPayController.getSettings
);
router.patch(
  '/settings',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  attendantPayController.updateSettings
);

export default router;
