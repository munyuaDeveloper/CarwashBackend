import express from 'express';
import walletController from '../controllers/walletController';
import authController from '../controllers/authController';

const router = express.Router();

// Protect all routes - require authentication
router.use(authController.protect);

// Attendant routes
router.get('/my-wallet', walletController.getMyWallet);
router.get('/my-wallet/bookings', walletController.getAttendantBookings);

// Admin routes
router.use(authController.restrictTo('admin'));

router.get('/', walletController.getAllWallets);
router.get('/summary', walletController.getWalletSummary);
router.get('/daily-summary', walletController.getDailyWalletSummary);
router.get('/unpaid', walletController.getUnpaidWallets);
router.get('/debt-summary', walletController.getCompanyDebtSummary);
router.get('/system', walletController.getSystemWallet);
router.get('/system/summary', walletController.getSystemWalletSummary);
router.get('/:attendantId', walletController.getAttendantWallet);
router.get('/:attendantId/debt', walletController.getAttendantDebt);
router.get('/:attendantId/bookings', walletController.getAttendantBookings);
router.patch('/:attendantId/mark-paid', walletController.markAttendantPaid);
router.patch('/:attendantId/rebuild', walletController.rebuildWalletBalance);
router.get('/bookings/:bookingId', walletController.getBookingDetails);
router.post('/settle', walletController.settleAttendantBalances);

export default router;
