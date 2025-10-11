import mongoose from 'mongoose';
import { IBooking } from '../types';

const bookingSchema = new mongoose.Schema({
  carRegistrationNumber: {
    type: String,
    required: [true, 'Car registration number is required'],
    trim: true,
    uppercase: true
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
    required: [true, 'Service type is required']
  },
  vehicleType: {
    type: String,
    required: [true, 'Vehicle type is required'],
    trim: true
  },
  paymentType: {
    type: String,
    enum: ['cash', 'till number', 'attendant collected'],
    required: [true, 'Payment type is required']
  },
  status: {
    type: String,
    enum: ['pending', 'in progress', 'completed', 'cancelled'],
    default: 'pending'
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
bookingSchema.index({ attendant: 1 });
bookingSchema.index({ createdAt: -1 });

// Pre-save middleware to update updatedAt
bookingSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const Booking = mongoose.model<IBooking>('Booking', bookingSchema);

export default Booking;
