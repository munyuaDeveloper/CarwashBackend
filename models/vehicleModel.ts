import mongoose from 'mongoose';
import { normalizePlate } from '../utils/contactNormalization';

const vehicleSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business is required']
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer is required']
    },
    plate: {
      type: String,
      required: [true, 'Plate is required'],
      trim: true,
      uppercase: true
    },
    vehicleType: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

vehicleSchema.index({ business: 1, plate: 1 }, { unique: true });
vehicleSchema.index({ business: 1, customer: 1 });

vehicleSchema.pre('save', function vehiclePreSave(next) {
  if (this.isModified('plate') || this.isNew) {
    if (typeof this.plate === 'string') {
      this.plate = normalizePlate(this.plate);
    }
  }
  next();
});

vehicleSchema.pre('findOneAndUpdate', function vehiclePreUpdate(next) {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (!update) {
    next();
    return;
  }

  const apply = (value: unknown) => {
    if (typeof value === 'string') {
      return normalizePlate(value);
    }
    return value;
  };

  if (update['$set'] && typeof update['$set'] === 'object') {
    const set = update['$set'] as Record<string, unknown>;
    if (set['plate'] !== undefined) {
      set['plate'] = apply(set['plate']);
    }
  } else if (update['plate'] !== undefined) {
    update['plate'] = apply(update['plate']);
  }

  next();
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

export default Vehicle;
