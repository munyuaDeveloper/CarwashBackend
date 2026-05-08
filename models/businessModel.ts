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
      washesRequired: {
        type: Number,
        default: 5,
        min: 1
      },
      rewardType: {
        type: String,
        default: '1 free wash',
        trim: true
      },
      smsEnabled: {
        type: Boolean,
        default: false
      },
      allowRewardWashToAccrue: {
        type: Boolean,
        default: false
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
