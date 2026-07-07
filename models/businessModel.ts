import mongoose from 'mongoose';

const businessSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Business name is required'],
      unique: true,
      trim: true
    },
    managerName: {
      type: String,
      trim: true
    },
    contactPhone: {
      type: String,
      trim: true
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true
    },
    location: {
      type: String,
      trim: true
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true
    },
    active: {
      type: Boolean,
      default: true
    },
    loyaltySettings: {
      enabled: {
        type: Boolean,
        default: false
      },
      pointsPerHundredKes: {
        type: Number,
        default: 10,
        min: 0.01
      },
      redemptionPoints: {
        type: Number,
        default: 500,
        min: 1
      },
      redemptionValueKes: {
        type: Number,
        default: 500,
        min: 1
      },
      rewardType: {
        type: String,
        default: 'KSh 500 discount',
        trim: true
      },
      earnOnNonOwnedVehicles: {
        type: Boolean,
        default: true
      },
      maxPointsEarnedPerDay: {
        type: Number,
        default: null,
        min: 0
      },
      maxRedeemableValuePerMonth: {
        type: Number,
        default: null,
        min: 0
      },
      smsEnabled: {
        type: Boolean,
        default: false
      },
      allowRewardWashToAccrue: {
        type: Boolean,
        default: false
      }
    },
    mpesaSettings: {
      enabled: {
        type: Boolean,
        default: false
      },
      environment: {
        type: String,
        enum: ['sandbox', 'production'],
        default: 'sandbox'
      },
      shortcodeType: {
        type: String,
        enum: ['paybill', 'till'],
        default: null
      },
      businessShortCode: {
        type: String,
        trim: true
      },
      passkeyEncrypted: {
        type: String
      },
      consumerKey: {
        type: String,
        trim: true
      },
      consumerSecretEncrypted: {
        type: String
      },
      accountReferencePrefix: {
        type: String,
        default: 'WF',
        trim: true
      }
    }
  },
  {
    // Let Mongoose manage creation timestamp at model level.
    timestamps: { createdAt: true, updatedAt: false }
  }
);

businessSchema.pre('save', function (next) {
  if (!this.isModified('name')) return next();
  this.slug = this.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  next();
});

const Business = mongoose.model('Business', businessSchema);

export default Business;
