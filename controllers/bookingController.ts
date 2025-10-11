import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import Booking from '../models/bookingModel';
import User from '../models/userModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';

const bookingController = {
  createBooking: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const {
      carRegistrationNumber,
      attendant,
      amount,
      serviceType,
      vehicleType,
      paymentType
    } = req.body;

    // Validate required fields
    if (!carRegistrationNumber || !attendant || !amount || !serviceType || !vehicleType || !paymentType) {
      return next(new AppError('All fields are required: carRegistrationNumber, attendant, amount, serviceType, vehicleType, paymentType', 400));
    }

    // Validate service type
    if (!['full wash', 'half wash'].includes(serviceType)) {
      return next(new AppError('Service type must be either "full wash" or "half wash"', 400));
    }

    // Validate payment type
    if (!['cash', 'till number', 'attendant collected'].includes(paymentType)) {
      return next(new AppError('Payment type must be either "cash", "till number", or "attendant collected"', 400));
    }

    // Validate amount
    if (amount <= 0) {
      return next(new AppError('Amount must be greater than 0', 400));
    }

    // Validate ObjectId format
    if (!attendant.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new AppError('Invalid attendant ID format', 400));
    }

    // Check if attendant exists
    const attendantExists = await User.findById(attendant);
    if (!attendantExists) {
      return next(new AppError('Attendant not found', 404));
    }

    // Create new booking
    const newBooking = await Booking.create({
      carRegistrationNumber: carRegistrationNumber.toUpperCase().trim(),
      attendant,
      amount,
      serviceType,
      vehicleType: vehicleType.trim(),
      paymentType
    });

    // Populate attendant details
    await newBooking.populate('attendant', 'name email role');

    res.status(201).json({
      status: 'success',
      data: {
        booking: newBooking
      }
    });
  }),

  getAllBookings: catchAsync(async (_req: IRequestWithUser, res: Response, _next: NextFunction) => {
    const bookings = await Booking.find()
      .populate('attendant', 'name email role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      data: {
        bookings
      }
    });
  }),

  getBooking: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const booking = await Booking.findById(req.params['id'])
      .populate('attendant', 'name email role');

    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        booking
      }
    });
  }),

  updateBooking: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const {
      carRegistrationNumber,
      attendant,
      amount,
      serviceType,
      vehicleType,
      paymentType,
      status
    } = req.body;

    // Validate service type if provided
    if (serviceType && !['full wash', 'half wash'].includes(serviceType)) {
      return next(new AppError('Service type must be either "full wash" or "half wash"', 400));
    }

    // Validate payment type if provided
    if (paymentType && !['cash', 'till number', 'attendant collected'].includes(paymentType)) {
      return next(new AppError('Payment type must be either "cash", "till number", or "attendant collected"', 400));
    }

    // Validate status if provided
    if (status && !['pending', 'in progress', 'completed', 'cancelled'].includes(status)) {
      return next(new AppError('Status must be either "pending", "in progress", "completed", or "cancelled"', 400));
    }

    // Validate amount if provided
    if (amount && amount <= 0) {
      return next(new AppError('Amount must be greater than 0', 400));
    }

    // Check if attendant exists if provided
    if (attendant) {
      const attendantExists = await User.findById(attendant);
      if (!attendantExists) {
        return next(new AppError('Attendant not found', 404));
      }
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params['id'],
      {
        ...(carRegistrationNumber && { carRegistrationNumber: carRegistrationNumber.toUpperCase().trim() }),
        ...(attendant && { attendant }),
        ...(amount && { amount }),
        ...(serviceType && { serviceType }),
        ...(vehicleType && { vehicleType: vehicleType.trim() }),
        ...(paymentType && { paymentType }),
        ...(status && { status })
      },
      {
        new: true,
        runValidators: true
      }
    ).populate('attendant', 'name email role');

    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        booking
      }
    });
  }),

  deleteBooking: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const booking = await Booking.findByIdAndDelete(req.params['id']);

    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  }),

  getBookingsByAttendant: catchAsync(async (req: IRequestWithUser, res: Response, _next: NextFunction) => {
    const bookings = await Booking.find({ attendant: req.params['attendantId'] })
      .populate('attendant', 'name email role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      data: {
        bookings
      }
    });
  }),

  getBookingsByStatus: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const status = req.params['status'];

    if (!status || !['pending', 'in progress', 'completed', 'cancelled'].includes(status)) {
      return next(new AppError('Status must be either "pending", "in progress", "completed", or "cancelled"', 400));
    }

    const bookings = await Booking.find({ status })
      .populate('attendant', 'name email role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      data: {
        bookings
      }
    });
  })
};

export default bookingController;
