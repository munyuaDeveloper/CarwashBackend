import mongoose from 'mongoose';

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

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

export default Vehicle;
