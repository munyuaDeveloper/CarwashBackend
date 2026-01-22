import express from 'express';
import appConfigController from '../controllers/appConfigController';
import authController from '../controllers/authController';

const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Admin routes only
router.use(authController.restrictTo('admin'));

// Get application configuration
router.get('/', appConfigController.getAppConfig);

// Update application configuration
router.patch('/', appConfigController.updateAppConfig);

export default router;
