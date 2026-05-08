import express, { Router } from 'express';
import userController from '../controllers/userController';
import authController from '../controllers/authController';

const router: Router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

router.post('/forgotPassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);

// Protect all routes after this middleware
router.use(authController.protect);

router.patch('/updateMyPassword', authController.updatePassword);
router.patch('/updateMe', userController.updateMe);
router.get('/me', userController.getMe, userController.getUser);

router.delete('/deleteMe', userController.deleteMe);

router
  .route('/')
  .get(authController.restrictTo('business_admin', 'system_admin'), userController.getAllUsers)
  .post(authController.restrictTo('business_admin', 'system_admin'), userController.createUser);

router
  .route('/:id')
  .get(authController.restrictTo('business_admin', 'system_admin'), userController.getUser)
  .patch(authController.restrictTo('business_admin', 'system_admin'), userController.updateUser)
  .delete(authController.restrictTo('business_admin', 'system_admin'), userController.deleteUser);

export default router;
