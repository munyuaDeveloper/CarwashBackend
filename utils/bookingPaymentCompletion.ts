import Booking from '../models/bookingModel';
import Wallet from '../models/walletModel';
import { processCompletedBookingLoyalty } from './loyaltyService';

export const completeBookingAfterMpesaPayment = async (bookingId: string): Promise<void> => {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status === 'completed' || booking.status === 'cancelled') {
    return;
  }

  const wallet = await Wallet.getOrCreateWallet(booking.attendant.toString());
  await wallet['addCompletedBooking'](booking.amount, booking.paymentType);

  booking.status = 'completed';
  await booking.save();

  if (!booking['loyaltyProcessed']) {
    try {
      await processCompletedBookingLoyalty(booking._id.toString());
    } catch (error) {
      console.error('Error processing loyalty after M-PESA payment:', error);
    }
  }
};
