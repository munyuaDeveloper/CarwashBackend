import express from 'express';
import authController from '../controllers/authController';
import vehicleController from '../controllers/vehicleController';

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo('business_admin', 'admin', 'system_admin'));

router.route('/').get(vehicleController.getAllVehicles).post(vehicleController.createVehicle);

router.route('/with-customer').post(vehicleController.createVehicleWithCustomer);

router.route('/:id').patch(vehicleController.updateVehicle).delete(vehicleController.deleteVehicle);

export default router;
