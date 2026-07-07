import mongoose from 'mongoose';
import { normalizePhoneForStorage } from '../utils/contactNormalization';

const loyaltyProfileSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business is required']
    },
    customerPhoneNumber: {
      type: String,
      required: [true, 'Customer phone number is required'],
      trim: true
    },
    customerName: {
      type: String,
      trim: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null
    },
    smsConsent: {
      type: Boolean,
      default: false
    },
    pointsBalance: {
      type: Number,
      default: 0,
      min: 0
    },
    totalPointsEarned: {
      type: Number,
      default: 0,
      min: 0
    },
    totalPointsRedeemed: {
      type: Number,
      default: 0,
      min: 0
    },
    pointsEarnedToday: {
      type: Number,
      default: 0,
      min: 0
    },
    pointsEarnedTodayDate: {
      type: String,
      trim: true
    },
    redeemValueThisMonth: {
      type: Number,
      default: 0,
      min: 0
    },
    redeemValueMonthKey: {
      type: String,
      trim: true
    },
    lastVehicleIdentifier: {
      type: String,
      trim: true,
      uppercase: true
    },
    lastPointsEarnedAt: Date,
    lastRedeemedAt: Date,
    lastCompletedBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking'
    }
  },
  {
    timestamps: true
  }
);

loyaltyProfileSchema.index({ business: 1, customerPhoneNumber: 1 }, { unique: true });

loyaltyProfileSchema.pre('save', function loyaltyProfilePreSave(next) {
  if (this.isModified('customerPhoneNumber') || this.isNew) {
    if (typeof this.customerPhoneNumber === 'string' && this.customerPhoneNumber.trim()) {
      this.customerPhoneNumber = normalizePhoneForStorage(this.customerPhoneNumber);
    }
  }
  next();
});

const LoyaltyProfile = mongoose.model('LoyaltyProfile', loyaltyProfileSchema);

export default LoyaltyProfile;
