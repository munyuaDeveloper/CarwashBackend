import mongoose from 'mongoose';
import { IBooking } from '../types';
import { normalizePhoneForStorage, normalizePlate } from '../utils/contactNormalization';

const bookingSchema = new mongoose.Schema({
  carRegistrationNumber: {
    type: String,
    required: function (this: any): boolean {
      return this.category === 'vehicle';
    },
    trim: true,
    uppercase: true
  },
  phoneNumber: {
    type: String,
    // required: function (this: any): boolean {
    //   return this.category === 'carpet';
    // },
    trim: true
  },
  customerPhoneNumber: {
    type: String,
    trim: true
  },
  customerName: {
    type: String,
    trim: true
  },
  smsConsent: {
    type: Boolean,
    default: false
  },
  isRewardWash: {
    type: Boolean,
    default: false
  },
  loyaltyPointsEarned: {
    type: Number,
    default: 0,
    min: 0
  },
  loyaltyPointsRedeemed: {
    type: Number,
    default: 0,
    min: 0
  },
  loyaltyDiscountKes: {
    type: Number,
    default: 0,
    min: 0
  },
  color: {
    type: String,
    required: function (this: any): boolean {
      return this.category === 'carpet';
    },
    trim: true
  },
  attendant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Attendant is required']
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: [true, 'Business is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount must be positive']
  },
  serviceType: {
    type: String,
    enum: ['full wash', 'half wash'],
    required: function (this: any): boolean {
      return this.category === 'vehicle';
    }
  },
  vehicleType: {
    type: String,
    required: function (this: any): boolean {
      return this.category === 'vehicle';
    },
    trim: true
  },
  category: {
    type: String,
    enum: ['vehicle', 'carpet'],
    required: [true, 'Category is required']
  },
  paymentType: {
    type: String,
    enum: ['attendant_cash', 'admin_cash', 'admin_till'],
    required: [true, 'Payment type is required']
  },
  status: {
    type: String,
    enum: ['pending', 'in progress', 'completed', 'cancelled'],
    default: 'in progress'
  },
  attendantPaid: {
    type: Boolean,
    default: false
  },
  note: {
    type: String,
    trim: true
  },
  loyaltyProcessed: {
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
bookingSchema.index({ carRegistrationNumber: 1 });
bookingSchema.index({ phoneNumber: 1 });
bookingSchema.index({ color: 1 });
bookingSchema.index({ category: 1 });
bookingSchema.index({ attendant: 1 });
bookingSchema.index({ business: 1 });
bookingSchema.index({ createdAt: -1 });

// Pre-save middleware to update updatedAt and normalize contact fields
bookingSchema.pre('save', function (next) {
  this.updatedAt = new Date();

  if (this.isModified('carRegistrationNumber') || this.isNew) {
    if (typeof this.carRegistrationNumber === 'string' && this.carRegistrationNumber.trim()) {
      this.carRegistrationNumber = normalizePlate(this.carRegistrationNumber);
    }
  }
  if (this.isModified('customerPhoneNumber') || this.isNew) {
    if (typeof this.customerPhoneNumber === 'string' && this.customerPhoneNumber.trim()) {
      this.customerPhoneNumber = normalizePhoneForStorage(this.customerPhoneNumber);
    }
  }
  if (this.isModified('phoneNumber') || this.isNew) {
    if (typeof this.phoneNumber === 'string' && this.phoneNumber.trim()) {
      this.phoneNumber = normalizePhoneForStorage(this.phoneNumber);
    }
  }

  next();
});

const Booking = mongoose.model<IBooking>('Booking', bookingSchema);

export default Booking;
