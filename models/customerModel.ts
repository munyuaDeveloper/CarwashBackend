import mongoose from 'mongoose';
import { normalizePhoneForStorage } from '../utils/contactNormalization';

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

customerSchema.index({ business: 1, phoneNumber: 1 }, { unique: true });

const normalizeCustomerPhone = (doc: { phoneNumber?: string }) => {
  if (typeof doc.phoneNumber === 'string' && doc.phoneNumber.trim()) {
    doc.phoneNumber = normalizePhoneForStorage(doc.phoneNumber);
  }
};

customerSchema.pre('save', function customerPreSave(next) {
  if (this.isModified('phoneNumber') || this.isNew) {
    normalizeCustomerPhone(this);
  }
  next();
});

customerSchema.pre('findOneAndUpdate', function customerPreUpdate(next) {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (!update) {
    next();
    return;
  }

  const apply = (value: unknown) => {
    if (typeof value === 'string') {
      return normalizePhoneForStorage(value);
    }
    return value;
  };

  if (update['$set'] && typeof update['$set'] === 'object') {
    const set = update['$set'] as Record<string, unknown>;
    if (set['phoneNumber'] !== undefined) {
      set['phoneNumber'] = apply(set['phoneNumber']);
    }
  } else if (update['phoneNumber'] !== undefined) {
    update['phoneNumber'] = apply(update['phoneNumber']);
  }

  next();
});

const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
