import express, { Router } from 'express';
import statsController from '../controllers/statsController';
import authController from '../controllers/authController';

const router: Router = express.Router();

// Protect all routes after this middleware
router.use(authController.protect);

router.get(
  '/',
  authController.restrictTo('admin', 'business_admin', 'system_admin'),
  statsController.getStats
);

export default router;

