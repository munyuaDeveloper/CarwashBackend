import mongoose from 'mongoose';

export type MpesaTransactionStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'timeout';

const mpesaTransactionSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 1
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true
    },
    accountReference: {
      type: String,
      required: true,
      trim: true
    },
    transactionDesc: {
      type: String,
      trim: true
    },
    merchantRequestId: {
      type: String,
      trim: true,
      index: true
    },
    checkoutRequestId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'cancelled', 'timeout'],
      default: 'pending',
      index: true
    },
    resultCode: {
      type: Number,
      default: null
    },
    resultDesc: {
      type: String,
      trim: true
    },
    mpesaReceiptNumber: {
      type: String,
      trim: true,
      index: true
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    responseCode: {
      type: String,
      trim: true
    },
    responseDescription: {
      type: String,
      trim: true
    },
    customerMessage: {
      type: String,
      trim: true
    },
    rawInitResponse: {
      type: mongoose.Schema.Types.Mixed
    },
    rawCallback: {
      type: mongoose.Schema.Types.Mixed
    },
    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

mpesaTransactionSchema.index({ business: 1, createdAt: -1 });
mpesaTransactionSchema.index({ booking: 1, status: 1, createdAt: -1 });

const MpesaTransaction = mongoose.model('MpesaTransaction', mpesaTransactionSchema);

export default MpesaTransaction;
