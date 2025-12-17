import express, { Router } from 'express';
import statsController from '../controllers/statsController';
import authController from '../controllers/authController';

const router: Router = express.Router();

// Protect all routes after this middleware
router.use(authController.protect);

// Admin only routes
router.use(authController.restrictTo('admin'));

router.get('/', statsController.getStats);

export default router;

