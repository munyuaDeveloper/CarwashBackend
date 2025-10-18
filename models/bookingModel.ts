import mongoose from 'mongoose';
import { IBooking } from '../types';

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
    enum: ['in progress', 'completed'],
    default: 'completed'
  },
  attendantPaid: {
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
bookingSchema.index({ createdAt: -1 });

// Pre-save middleware to update updatedAt
bookingSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const Booking = mongoose.model<IBooking>('Booking', bookingSchema);

export default Booking;
