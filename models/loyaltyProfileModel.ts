import mongoose from 'mongoose';

const loyaltyProfileSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business is required']
    },
    vehicleIdentifier: {
      type: String,
      required: [true, 'Vehicle identifier is required'],
      trim: true,
      uppercase: true
    },
    customerPhoneNumber: {
      type: String,
      trim: true
    },
    smsConsent: {
      type: Boolean,
      default: false
    },
    totalCompletedPaidWashes: {
      type: Number,
      default: 0,
      min: 0
    },
    pendingRewards: {
      type: Number,
      default: 0,
      min: 0
    },
    totalRewardsEarned: {
      type: Number,
      default: 0,
      min: 0
    },
    totalRewardsRedeemed: {
      type: Number,
      default: 0,
      min: 0
    },
    lastRewardEarnedAt: Date,
    lastRewardRedeemedAt: Date,
    lastCompletedBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking'
    }
  },
  {
    timestamps: true
  }
);

loyaltyProfileSchema.index({ business: 1, vehicleIdentifier: 1 }, { unique: true });
loyaltyProfileSchema.index({ business: 1, customerPhoneNumber: 1 });

const LoyaltyProfile = mongoose.model('LoyaltyProfile', loyaltyProfileSchema);

export default LoyaltyProfile;
