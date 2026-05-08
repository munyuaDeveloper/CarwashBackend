import mongoose from 'mongoose';

const smsLogSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business is required']
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking'
    },
    loyaltyProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoyaltyProfile'
    },
    templateType: {
      type: String,
      enum: ['loyalty_progress', 'reward_achievement'],
      required: [true, 'Template type is required']
    },
    recipientPhone: {
      type: String,
      required: [true, 'Recipient phone is required'],
      trim: true
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true
    },
    gatewayProvider: {
      type: String,
      default: 'africas_talking'
    },
    gatewayMessageId: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed'],
      default: 'queued'
    },
    attempts: {
      type: Number,
      default: 0
    },
    errorMessage: {
      type: String,
      trim: true
    },
    rawGatewayResponse: mongoose.Schema.Types.Mixed
  },
  {
    timestamps: true
  }
);

smsLogSchema.index({ business: 1, createdAt: -1 });
smsLogSchema.index({ status: 1, createdAt: -1 });

const SmsLog = mongoose.model('SmsLog', smsLogSchema);

export default SmsLog;
