import express from 'express';
import authController from '../controllers/authController';
import loyaltyController from '../controllers/loyaltyController';

const router = express.Router();

router.use(authController.protect);

router.get(
  '/config/:businessId',
  authController.restrictTo('system_admin', 'admin'),
  loyaltyController.getBusinessLoyaltyConfig
);
router.patch(
  '/config/:businessId',
  authController.restrictTo('system_admin', 'admin'),
  loyaltyController.updateBusinessLoyaltyConfig
);

router.get(
  '/config',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  loyaltyController.getBusinessLoyaltyConfig
);
router.patch(
  '/config',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  loyaltyController.updateBusinessLoyaltyConfig
);

router.get(
  '/templates',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  loyaltyController.getSmsTemplates
);
router.post(
  '/templates',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  loyaltyController.upsertSmsTemplate
);

router.get(
  '/templates/pending',
  authController.restrictTo('system_admin', 'admin'),
  loyaltyController.getPendingTemplates
);
router.get(
  '/templates/queue/stats',
  authController.restrictTo('system_admin', 'admin'),
  loyaltyController.getTemplateQueue
);
router.patch(
  '/templates/:id/review',
  authController.restrictTo('system_admin', 'admin'),
  loyaltyController.reviewSmsTemplate
);

router.patch(
  '/consent',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  loyaltyController.updateCustomerConsent
);
router.get(
  '/report',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  loyaltyController.getBusinessLoyaltyReport
);
router.get(
  '/sms-logs',
  authController.restrictTo('business_admin', 'admin', 'system_admin'),
  loyaltyController.getSmsLogs
);

export default router;
