import express from 'express';
import businessController from '../controllers/businessController';
import authController from '../controllers/authController';

const router = express.Router();

// Protect all routes
router.use(authController.protect);

// Business CRUD should be controlled by central admins
router.use(authController.restrictTo('system_admin', 'admin'));

router
  .route('/')
  .get(businessController.getAllBusinesses)
  .post(businessController.createBusiness);

router
  .route('/:id')
  .get(businessController.getBusiness)
  .patch(businessController.updateBusiness)
  .delete(businessController.deleteBusiness);

export default router;
