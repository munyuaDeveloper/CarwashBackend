import Booking from '../models/bookingModel';
import User from '../models/userModel';
import Wallet from '../models/walletModel';
import AttendantPayAccrual from '../models/attendantPayAccrualModel';
import {
  getAttendantPaySettings,
  getPayPeriod,
  getSharesFromBooking,
  type AttendantPayMode,
  type AttendantPaySettings
} from './attendantPayMath';

export {
  DEFAULT_ATTENDANT_PAY_SETTINGS,
  getAttendantPaySettings,
  getPayPeriod,
  getSharesForAmount,
  getSharesFromBooking,
  normalizeAttendantPaySettings,
  paySnapshotFields,
  splitBookingAmount,
  type AttendantPayMode,
  type AttendantPaySettings,
  type PayShares
} from './attendantPayMath';

const roundKes = (value: number): number => Math.round(value * 100) / 100;

const creditWalletSalary = async (attendantId: string, amount: number): Promise<void> => {
  if (amount <= 0) return;
  const wallet = await Wallet.getOrCreateWallet(attendantId);
  wallet.balance = (wallet.balance || 0) + amount;
  wallet.isPaid = false;
  await wallet.save();
};

const debitWalletSalary = async (attendantId: string, amount: number): Promise<void> => {
  if (amount <= 0) return;
  const wallet = await Wallet.getOrCreateWallet(attendantId);
  wallet.balance = (wallet.balance || 0) - amount;
  if (wallet.balance !== 0) wallet.isPaid = false;
  await wallet.save();
};

const resolveSalaryAmount = async (
  attendantId: string,
  settings: AttendantPaySettings
): Promise<number> => {
  const attendant = await User.findById(attendantId).select('salaryAmountKes');
  const override = Number(attendant?.['salaryAmountKes']);
  if (Number.isFinite(override) && override > 0) return roundKes(override);
  return roundKes(settings.salaryAmountKes);
};

type AccrualBooking = {
  _id?: { toString: () => string } | string;
  attendant: { toString: () => string } | string;
  business: { toString: () => string } | string;
  createdAt?: Date;
  attendantPayMode?: AttendantPayMode | null;
};

export const ensureSalaryAccrual = async (booking: AccrualBooking): Promise<void> => {
  const mode = booking.attendantPayMode || (await getAttendantPaySettings(booking.business.toString())).mode;
  const period = getPayPeriod(mode, booking.createdAt || new Date());
  if (!period) return;

  const attendantId = booking.attendant.toString();
  const businessId = booking.business.toString();
  const existing = await AttendantPayAccrual.findOne({
    attendant: attendantId,
    periodKey: period.periodKey
  });
  if (existing) return;

  const settings = await getAttendantPaySettings(businessId);
  const amountKes = await resolveSalaryAmount(attendantId, settings);
  if (amountKes <= 0) return;

  await AttendantPayAccrual.create({
    business: businessId,
    attendant: attendantId,
    period: period.period,
    periodKey: period.periodKey,
    amountKes,
    status: 'due'
  });
  await creditWalletSalary(attendantId, amountKes);
};

export const reverseSalaryAccrualIfIdle = async (booking: AccrualBooking): Promise<void> => {
  const mode = booking.attendantPayMode || (await getAttendantPaySettings(booking.business.toString())).mode;
  const period = getPayPeriod(mode, booking.createdAt || new Date());
  if (!period) return;

  const attendantId = booking.attendant.toString();
  const remainingBookings = await Booking.find({
    attendant: attendantId,
    status: 'completed',
    attendantPaid: false,
    ...(booking._id ? { _id: { $ne: booking._id } } : {})
  }).select('createdAt');

  const remainingInPeriod = remainingBookings.filter((item) => {
    const itemPeriod = getPayPeriod(mode, item.createdAt || new Date());
    return itemPeriod?.periodKey === period.periodKey;
  }).length;

  if (remainingInPeriod > 0) return;

  const accrual = await AttendantPayAccrual.findOne({
    attendant: attendantId,
    periodKey: period.periodKey,
    status: 'due'
  });
  if (!accrual) return;

  await debitWalletSalary(attendantId, accrual['amountKes']);
  await accrual.deleteOne();
};

export const applyCompletedBookingToWallet = async (booking: {
  _id?: { toString: () => string } | string;
  attendant: { toString: () => string } | string;
  business: { toString: () => string } | string;
  amount: number;
  paymentType: string;
  createdAt?: Date;
  attendantShareKes?: number | null;
  companyShareKes?: number | null;
  attendantPayMode?: AttendantPayMode | null;
}): Promise<void> => {
  const shares = getSharesFromBooking(booking);
  const wallet = await Wallet.getOrCreateWallet(booking.attendant.toString());
  wallet.isPaid = false;
  await wallet['addCompletedBooking'](booking.amount, booking.paymentType, shares);
  await ensureSalaryAccrual(booking);
};

export const reverseCompletedBookingFromWallet = async (booking: {
  _id?: { toString: () => string } | string;
  attendant: { toString: () => string } | string;
  business: { toString: () => string } | string;
  amount: number;
  paymentType: string;
  createdAt?: Date;
  attendantShareKes?: number | null;
  companyShareKes?: number | null;
  attendantPayMode?: AttendantPayMode | null;
}): Promise<void> => {
  const shares = getSharesFromBooking(booking);
  const wallet = await Wallet.getOrCreateWallet(booking.attendant.toString());
  await wallet['removeCompletedBooking'](booking.amount, booking.paymentType, shares);
  await reverseSalaryAccrualIfIdle(booking);
};

export const markSalaryAccrualsPaid = async (attendantId: string): Promise<void> => {
  await AttendantPayAccrual.updateMany(
    { attendant: attendantId, status: 'due' },
    { status: 'paid', paidAt: new Date() }
  );
};
