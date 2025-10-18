import mongoose from 'mongoose';
import { ISystemWallet, ISystemWalletModel } from '../types';

const systemWalletSchema = new mongoose.Schema({
  totalRevenue: {
    type: Number,
    default: 0
  },
  totalCompanyShare: {
    type: Number,
    default: 0
  },
  totalAttendantPayments: {
    type: Number,
    default: 0
  },
  totalAdminCollections: {
    type: Number,
    default: 0
  },
  totalAttendantCollections: {
    type: Number,
    default: 0
  },
  currentBalance: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
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
systemWalletSchema.index({ createdAt: -1 });
systemWalletSchema.index({ lastUpdated: -1 });

// Pre-save middleware to update updatedAt
systemWalletSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  this.lastUpdated = new Date();
  next();
});

// Instance method to credit system wallet
systemWalletSchema.methods['creditSystemWallet'] = function (amount: number, source: string) {
  this['totalRevenue'] += amount;
  this['currentBalance'] += amount;

  if (source === 'admin_collection') {
    this['totalAdminCollections'] += amount;
  } else if (source === 'attendant_submission') {
    this['totalAttendantPayments'] += amount;
  }

  return this['save']();
};

// Instance method to track company share
systemWalletSchema.methods['trackCompanyShare'] = function (amount: number) {
  this['totalCompanyShare'] += amount;
  return this['save']();
};

// Instance method to reverse system wallet transaction
systemWalletSchema.methods['reverseSystemWalletTransaction'] = function (amount: number, source: string) {
  this['totalRevenue'] -= amount;
  this['currentBalance'] -= amount;

  if (source === 'admin_collection') {
    this['totalAdminCollections'] -= amount;
  } else if (source === 'attendant_submission') {
    this['totalAttendantPayments'] -= amount;
  } else if (source === 'attendant_collection') {
    this['totalAttendantCollections'] -= amount;
  }

  // Ensure values don't go below zero
  this['totalRevenue'] = Math.max(0, this['totalRevenue']);
  this['currentBalance'] = Math.max(0, this['currentBalance']);
  this['totalAdminCollections'] = Math.max(0, this['totalAdminCollections']);
  this['totalAttendantPayments'] = Math.max(0, this['totalAttendantPayments']);
  this['totalAttendantCollections'] = Math.max(0, this['totalAttendantCollections']);

  return this['save']();
};

// Instance method to recalculate system wallet balance
systemWalletSchema.methods['recalculateSystemWalletBalance'] = async function () {
  // This method would recalculate the system wallet balance from all wallet transactions
  // For now, we'll keep the current implementation but this could be enhanced
  // to recalculate from transaction history if needed
  return this['save']();
};

// Static method to get or create system wallet
systemWalletSchema.statics['getOrCreateSystemWallet'] = async function () {
  let systemWallet = await this.findOne();

  if (!systemWallet) {
    systemWallet = await this.create({});
  }

  return systemWallet;
};

const SystemWallet = mongoose.model<ISystemWallet, ISystemWalletModel>('SystemWallet', systemWalletSchema);

export default SystemWallet;
