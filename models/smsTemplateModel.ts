import mongoose from 'mongoose';

const smsTemplateAuditSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['submitted', 'approved', 'rejected', 'disabled', 'updated'],
      required: true
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    comment: {
      type: String,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const smsTemplateSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business is required']
    },
    type: {
      type: String,
      enum: ['loyalty_progress', 'reward_achievement'],
      required: [true, 'Template type is required']
    },
    content: {
      type: String,
      required: [true, 'Template content is required'],
      trim: true
    },
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'approved', 'rejected', 'disabled'],
      default: 'draft'
    },
    lastReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastReviewedAt: Date,
    rejectionReason: {
      type: String,
      trim: true
    },
    auditTrail: {
      type: [smsTemplateAuditSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

smsTemplateSchema.index({ business: 1, type: 1 }, { unique: true });
smsTemplateSchema.index({ status: 1, updatedAt: -1 });

const SmsTemplate = mongoose.model('SmsTemplate', smsTemplateSchema);

export default SmsTemplate;
