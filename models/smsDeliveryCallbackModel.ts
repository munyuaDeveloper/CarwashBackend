import mongoose from 'mongoose';

const businessDetailsSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true
    },
    name: { type: String, required: true, trim: true },
    managerName: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
    location: { type: String, trim: true },
    slug: { type: String, trim: true }
  },
  { _id: false }
);

const smsDeliveryCallbackSchema = new mongoose.Schema(
  {
    smsLog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SmsLog'
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business'
    },
    businessDetails: businessDetailsSchema,
    gatewayMessageId: {
      type: String,
      trim: true,
      index: true
    },
    recipientPhone: {
      type: String,
      trim: true
    },
    deliveryStatus: {
      type: String,
      enum: ['delivered', 'undelivered', 'pending', 'unknown'],
      default: 'unknown'
    },
    deliveryDescription: {
      type: String,
      trim: true
    },
    rawPayload: mongoose.Schema.Types.Mixed,
    matchedBy: {
      type: String,
      enum: ['message_id', 'client_sms_id', 'mobile_recent', 'unmatched'],
      default: 'unmatched'
    }
  },
  {
    timestamps: true
  }
);

smsDeliveryCallbackSchema.index({ business: 1, createdAt: -1 });
smsDeliveryCallbackSchema.index({ smsLog: 1, createdAt: -1 });

const SmsDeliveryCallback = mongoose.model('SmsDeliveryCallback', smsDeliveryCallbackSchema);

export default SmsDeliveryCallback;
