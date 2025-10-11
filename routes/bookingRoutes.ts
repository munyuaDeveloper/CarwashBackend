import express, { Router } from 'express';
import bookingController from '../controllers/bookingController';
import authController from '../controllers/authController';

const router: Router = express.Router();

// Protect all routes after this middleware
router.use(authController.protect);

// Routes for booking management
router
  .route('/')
  .get(bookingController.getAllBookings);

// Admin only routes
router.use(authController.restrictTo('admin'));

router
  .route('/')
  .post(bookingController.createBooking);

router
  .route('/:id')
  .get(bookingController.getBooking)
  .patch(bookingController.updateBooking)
  .delete(bookingController.deleteBooking);

// Additional routes for filtering
router.get('/attendant/:attendantId', bookingController.getBookingsByAttendant);
router.get('/status/:status', bookingController.getBookingsByStatus);

export default router;
