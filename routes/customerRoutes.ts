import express from 'express';
import authController from '../controllers/authController';
import customerController from '../controllers/customerController';

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo('business_admin', 'admin', 'system_admin'));

router
  .route('/')
  .get(customerController.getAllCustomers)
  .post(customerController.createCustomer);

router
  .route('/:id')
  .get(customerController.getCustomer)
  .patch(customerController.updateCustomer)
  .delete(customerController.deleteCustomer);

export default router;
