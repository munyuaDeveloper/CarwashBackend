import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business is required']
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true
    },
    phoneNumber: {
      type: String,
      required: [true, 'Customer phone number is required'],
      trim: true
    },
    /** @deprecated Legacy field from single-plate-per-customer model; use Vehicle documents instead */
    vehiclePlate: {
      type: String,
      trim: true,
      uppercase: true
    },
    smsConsent: {
      type: Boolean,
      default: false
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

customerSchema.index({ business: 1, phoneNumber: 1 });

const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
