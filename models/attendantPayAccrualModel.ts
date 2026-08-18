import mongoose from 'mongoose';

const attendantPayAccrualSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true
    },
    attendant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    period: {
      type: String,
      enum: ['day', 'month'],
      required: true
    },
    periodKey: {
      type: String,
      required: true,
      trim: true
    },
    amountKes: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['due', 'paid'],
      default: 'due'
    },
    paidAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

attendantPayAccrualSchema.index({ attendant: 1, periodKey: 1 }, { unique: true });
attendantPayAccrualSchema.index({ business: 1, status: 1 });

const AttendantPayAccrual = mongoose.model('AttendantPayAccrual', attendantPayAccrualSchema);

export default AttendantPayAccrual;
