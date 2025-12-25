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
  adjustments: [{
    type: {
      type: String,
      enum: ['tip', 'deduction'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    reason: {
      type: String,
      default: null
    },
    adjustedBy: {
      type: String,
      required: true
    },
    adjustedAt: {
      type: Date,
      default: Date.now
    }
  }],
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

// Instance method to add a completed booking to wallet balance (incremental)
// This is called when a booking is marked as completed
walletSchema.methods['addCompletedBooking'] = function (amount: number, paymentType: string) {
  const commission = amount * 0.4; // 40% commission
  const companyShare = amount * 0.6; // 60% company share

  // Update totals
  this['totalEarnings'] = (this['totalEarnings'] || 0) + amount;
  this['totalCommission'] = (this['totalCommission'] || 0) + commission;
  this['totalCompanyShare'] = (this['totalCompanyShare'] || 0) + companyShare;

  // Update balance based on payment type (incremental)
  // Balance = booking contributions + adjustments
  if (paymentType === 'attendant_cash') {
    // For attendant_cash: balance decreases by companyShare (attendant owes company)
    this['balance'] = (this['balance'] || 0) - companyShare;
    this['companyDebt'] = (this['companyDebt'] || 0) + companyShare;
  } else {
    // For admin_cash/admin_till: balance increases by commission (no debt)
    this['balance'] = (this['balance'] || 0) + commission;
  }

  // Set isPaid to false if balance is not zero
  if (this['balance'] !== 0) {
    this['isPaid'] = false;
  }

  return this['save']();
};

// Instance method to remove/reverse a completed booking from wallet balance (incremental)
// This is called when a booking is deleted or status changes from completed
walletSchema.methods['removeCompletedBooking'] = function (amount: number, paymentType: string) {
  const commission = amount * 0.4; // 40% commission
  const companyShare = amount * 0.6; // 60% company share

  // Update totals (subtract)
  this['totalEarnings'] = Math.max(0, (this['totalEarnings'] || 0) - amount);
  this['totalCommission'] = Math.max(0, (this['totalCommission'] || 0) - commission);
  this['totalCompanyShare'] = Math.max(0, (this['totalCompanyShare'] || 0) - companyShare);

  // Reverse balance change based on payment type
  if (paymentType === 'attendant_cash') {
    // Reverse: add back the companyShare
    this['balance'] = (this['balance'] || 0) + companyShare;
    this['companyDebt'] = Math.max(0, (this['companyDebt'] || 0) - companyShare);
  } else {
    // Reverse: subtract the commission
    this['balance'] = (this['balance'] || 0) - commission;
  }

  // Set isPaid to false if balance is not zero
  if (this['balance'] !== 0) {
    this['isPaid'] = false;
  }

  return this['save']();
};

// Instance method to update wallet balance when a booking is modified
// This calculates the difference and adjusts incrementally
walletSchema.methods['updateCompletedBooking'] = function (
  oldAmount: number,
  oldPaymentType: string,
  newAmount: number,
  newPaymentType: string
) {
  // Remove old booking contribution
  this['removeCompletedBooking'](oldAmount, oldPaymentType);
  // Add new booking contribution
  this['addCompletedBooking'](newAmount, newPaymentType);

  return this['save']();
};

// Instance method to rebuild wallet balance from all unpaid completed bookings and adjustments
// This is kept for migration/repair purposes, but should not be used in normal flow
walletSchema.methods['rebuildWalletBalance'] = async function () {
  const attendantId = this['attendant'];

  // Get all completed bookings for this attendant that are not yet paid (regardless of date)
  const bookings = await Booking.find({
    attendant: attendantId,
    status: 'completed',
    attendantPaid: false
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

  // Add adjustments to balance (tips add, deductions subtract)
  const adjustments = (this as any).adjustments || [];

  if (Array.isArray(adjustments) && adjustments.length > 0) {
    adjustments.forEach((adjustment: any) => {
      if (adjustment && adjustment.type === 'tip') {
        balance += adjustment.amount || 0;
      } else if (adjustment && adjustment.type === 'deduction') {
        balance -= adjustment.amount || 0;
      }
    });
  }

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

// Legacy method for date-specific calculations (kept for backward compatibility)
// This is now only used for date-specific queries, not for general balance calculation
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

  // Add adjustments to balance (tips add, deductions subtract)
  const adjustments = (this as any).adjustments || [];

  if (Array.isArray(adjustments) && adjustments.length > 0) {
    adjustments.forEach((adjustment: any) => {
      if (adjustment && adjustment.type === 'tip') {
        balance += adjustment.amount || 0;
      } else if (adjustment && adjustment.type === 'deduction') {
        balance -= adjustment.amount || 0;
      }
    });
  }

  // For date-specific queries, we don't update the stored balance
  // We just return the calculated values for that date
  return {
    balance,
    totalEarnings,
    totalCommission,
    totalCompanyShare,
    companyDebt
  };
};

// Instance method to reset wallet after payment
walletSchema.methods['resetWallet'] = function () {
  this['balance'] = 0;
  this['totalEarnings'] = 0;
  this['totalCommission'] = 0;
  this['totalCompanyShare'] = 0;
  this['companyDebt'] = 0; // Reset company debt when marked as paid
  this['adjustments'] = []; // Clear adjustments when wallet is reset
  this['lastPaymentDate'] = new Date();
  this['isPaid'] = true;
  return this['save']();
};

// Static method to get or create wallet for attendant
// Wallet balance starts at 0 and is adjusted incrementally when bookings are completed
walletSchema.statics['getOrCreateWallet'] = async function (attendantId: string) {
  let wallet = await this.findOne({ attendant: attendantId });

  if (!wallet) {
    // Create new wallet with zero balance
    wallet = await this.create({
      attendant: attendantId,
      balance: 0,
      totalEarnings: 0,
      totalCommission: 0,
      totalCompanyShare: 0,
      companyDebt: 0,
      isPaid: true
    });
  }

  // Return wallet with stored balance (no recalculation)
  return wallet;
};

const Wallet = mongoose.model<IWallet, IWalletModel>('Wallet', walletSchema);

export default Wallet;
