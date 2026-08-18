import Booking from '../models/bookingModel';
import { applyCompletedBookingToWallet, getSharesForAmount, paySnapshotFields } from './attendantPay';
import { processCompletedBookingLoyalty } from './loyaltyService';

export const completeBookingAfterMpesaPayment = async (bookingId: string): Promise<void> => {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status === 'completed' || booking.status === 'cancelled') {
    return;
  }

  const shares = await getSharesForAmount(booking.business.toString(), booking.amount);
  booking.set(paySnapshotFields(shares));
  booking.status = 'completed';
  await booking.save();

  await applyCompletedBookingToWallet(booking);

  if (!booking['loyaltyProcessed']) {
    try {
      await processCompletedBookingLoyalty(booking._id.toString());
    } catch (error) {
      console.error('Error processing loyalty after M-PESA payment:', error);
    }
  }
};
