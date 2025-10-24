import mongoose from 'mongoose';
import { IWallet, IWalletModel } from '../types';
import Booking from './bookingModel';

const walletSchema = new mongoose.Schema({
  attendant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Attendant is required'],
    unique: true
  },
  balance: {
    type: Number,
    default: 0
    // Note: Balance can be negative when attendant collects cash but owes company
  },
  totalEarnings: {
    type: Number,
    default: 0,
    min: [0, 'Total earnings cannot be negative']
  },
  totalCommission: {
    type: Number,
    default: 0,
    min: [0, 'Total commission cannot be negative']
  },
  totalCompanyShare: {
    type: Number,
    default: 0,
    min: [0, 'Total company share cannot be negative']
  },
  companyDebt: {
    type: Number,
    default: 0,
    min: [0, 'Company debt cannot be negative']
  },
  lastPaymentDate: {
    type: Date,
    default: null
  },
  isPaid: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
// Note: attendant index is automatically created by unique: true
walletSchema.index({ isPaid: 1 });
walletSchema.index({ createdAt: -1 });

// Pre-save middleware to update updatedAt and handle isPaid status
walletSchema.pre('save', function (next) {
  this.updatedAt = new Date();

  // If balance is not zero (positive or negative), set isPaid to false
  // Only when balance is exactly 0 should isPaid be true (fully settled)
  if (this.balance !== 0) {
    this.isPaid = false;
  }

  next();
});

// Instance method to calculate balance from bookings (specific date or current date)
walletSchema.methods['calculateBalanceFromBookings'] = async function (targetDate?: Date) {
  const attendantId = this['attendant'];

  // Use provided date or current date
  const dateToUse = targetDate || new Date();
  const startOfDay = new Date(dateToUse.getFullYear(), dateToUse.getMonth(), dateToUse.getDate());
  const endOfDay = new Date(dateToUse.getFullYear(), dateToUse.getMonth(), dateToUse.getDate() + 1);

  // Get all completed bookings for this attendant from the specified date that are not yet paid
  const bookings = await Booking.find({
    attendant: attendantId,
    status: 'completed',
    attendantPaid: false,
    createdAt: {
      $gte: startOfDay,
      $lt: endOfDay
    }
  });

  let balance = 0;
  let totalEarnings = 0;
  let totalCommission = 0;
  let totalCompanyShare = 0;
  let companyDebt = 0;

  bookings.forEach((booking: any) => {
    const amount = booking.amount;
    const commission = amount * 0.4; // 40% commission
    const companyShare = amount * 0.6; // 60% company share

    totalEarnings += amount;
    totalCommission += commission;
    totalCompanyShare += companyShare;

    if (booking.paymentType === 'attendant_cash') {
      // For attendant_cash: balance = -companyShare (attendant owes company)
      balance -= companyShare;
      companyDebt += companyShare;
    } else {
      // For admin_cash/admin_till: balance = commission (no debt)
      balance += commission;
    }
  });

  this['balance'] = balance;
  this['totalEarnings'] = totalEarnings;
  this['totalCommission'] = totalCommission;
  this['totalCompanyShare'] = totalCompanyShare;
  this['companyDebt'] = companyDebt;

  // Set isPaid to false if balance is not zero (positive or negative)
  // Only when balance is exactly 0 should isPaid be true (fully settled)
  if (balance !== 0) {
    this['isPaid'] = false;
  }

  return this['save']();
};

// Instance method to reset wallet after payment
walletSchema.methods['resetWallet'] = function () {
  this['balance'] = 0;
  this['totalEarnings'] = 0;
  this['totalCommission'] = 0;
  this['totalCompanyShare'] = 0;
  this['companyDebt'] = 0; // Reset company debt when marked as paid
  this['lastPaymentDate'] = new Date();
  this['isPaid'] = true;
  return this['save']();
};

// Static method to get or create wallet for attendant
walletSchema.statics['getOrCreateWallet'] = async function (attendantId: string) {
  let wallet = await this.findOne({ attendant: attendantId });

  if (!wallet) {
    wallet = await this.create({ attendant: attendantId });
  }

  // Always calculate balance from bookings to ensure accuracy
  await wallet['calculateBalanceFromBookings']();

  return wallet;
};

const Wallet = mongoose.model<IWallet, IWalletModel>('Wallet', walletSchema);

export default Wallet;
