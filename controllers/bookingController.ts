import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import Booking from '../models/bookingModel';
import User from '../models/userModel';
import Wallet from '../models/walletModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';

const bookingController = {
  createBooking: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const {
      carRegistrationNumber,
      phoneNumber,
      color,
      attendant,
      amount,
      serviceType,
      vehicleType,
      category,
      paymentType
    } = req.body;

    // Validate required fields
    if (!attendant || !amount || !category || !paymentType) {
      return next(new AppError('Required fields: attendant, amount, category, paymentType', 400));
    }

    // Validate category
    if (!['vehicle', 'carpet'].includes(category)) {
      return next(new AppError('Category must be either "vehicle" or "carpet"', 400));
    }

    // Validate category-specific fields
    if (category === 'vehicle') {
      if (!carRegistrationNumber || !serviceType || !vehicleType) {
        return next(new AppError('For vehicle bookings: carRegistrationNumber, serviceType, and vehicleType are required', 400));
      }
      if (!['full wash', 'half wash'].includes(serviceType)) {
        return next(new AppError('Service type must be either "full wash" or "half wash"', 400));
      }
    }
    // else if (category === 'carpet') {
    //   if (!phoneNumber || !color) {
    //     return next(new AppError('For carpet bookings: phoneNumber and color are required', 400));
    //   }
    // }

    // Validate payment type
    if (!['attendant_cash', 'admin_cash', 'admin_till'].includes(paymentType)) {
      return next(new AppError('Payment type must be either "attendant_cash", "admin_cash", or "admin_till"', 400));
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

    // Create booking data based on category
    const bookingData: any = {
      attendant,
      amount,
      category,
      paymentType
    };

    if (category === 'vehicle') {
      bookingData.carRegistrationNumber = carRegistrationNumber.toUpperCase().trim();
      bookingData.serviceType = serviceType;
      bookingData.vehicleType = vehicleType.trim();
    } else if (category === 'carpet') {
      bookingData.phoneNumber = phoneNumber.trim();
      bookingData.color = color.trim();
    }

    // Create new booking
    const newBooking = await Booking.create(bookingData);

    // Update wallet balance when booking is created
    try {
      const wallet = await Wallet.getOrCreateWallet(attendant);
      // Always set isPaid to false when a new booking is created
      wallet.isPaid = false;
      await wallet['calculateBalanceFromBookings']();
    } catch (error) {
      console.error('Error updating wallet balance:', error);
      // Don't fail the booking creation if wallet update fails
    }

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
      phoneNumber,
      color,
      attendant,
      amount,
      serviceType,
      vehicleType,
      category,
      paymentType,
      status
    } = req.body;

    // Validate category if provided
    if (category && !['vehicle', 'carpet'].includes(category)) {
      return next(new AppError('Category must be either "vehicle" or "carpet"', 400));
    }

    // Validate service type if provided
    if (serviceType && !['full wash', 'half wash'].includes(serviceType)) {
      return next(new AppError('Service type must be either "full wash" or "half wash"', 400));
    }

    // Validate payment type if provided
    if (paymentType && !['attendant_cash', 'admin_cash', 'admin_till'].includes(paymentType)) {
      return next(new AppError('Payment type must be either "attendant_cash", "admin_cash", or "admin_till"', 400));
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

    // Get the original booking to check for changes that affect wallet
    const originalBooking = await Booking.findById(req.params['id']);
    if (!originalBooking) {
      return next(new AppError('Booking not found', 404));
    }

    // Determine final attendant for wallet calculations
    const finalAttendant = attendant || originalBooking.attendant;

    // Check if wallet-affecting fields have changed
    const amountChanged = amount !== undefined && amount !== originalBooking.amount;
    const attendantChanged = attendant !== undefined && attendant.toString() !== originalBooking.attendant.toString();
    const paymentTypeChanged = paymentType !== undefined && paymentType !== originalBooking.paymentType;

    // If any wallet-affecting field changed, recalculate wallet balances
    if (amountChanged || attendantChanged || paymentTypeChanged) {
      try {
        // Recalculate wallet balance for the original attendant
        if (originalBooking.attendant) {
          const originalWallet = await Wallet.getOrCreateWallet(originalBooking.attendant);
          await originalWallet['calculateBalanceFromBookings']();
        }

        // Recalculate wallet balance for the new attendant if different
        if (attendantChanged && finalAttendant) {
          const newWallet = await Wallet.getOrCreateWallet(finalAttendant);
          await newWallet['calculateBalanceFromBookings']();
        }
      } catch (error) {
        console.error('Error updating wallet balances:', error);
        // Don't fail the booking update if wallet update fails, but log the error
      }
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params['id'],
      {
        ...(carRegistrationNumber && { carRegistrationNumber: carRegistrationNumber.toUpperCase().trim() }),
        ...(phoneNumber && { phoneNumber: phoneNumber.trim() }),
        ...(color && { color: color.trim() }),
        ...(attendant && { attendant }),
        ...(amount && { amount }),
        ...(serviceType && { serviceType }),
        ...(vehicleType && { vehicleType: vehicleType.trim() }),
        ...(category && { category }),
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
    // Get the booking before deleting to update wallet balance
    const booking = await Booking.findById(req.params['id']);

    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }

    // Update wallet balance after deleting the booking
    try {
      const wallet = await Wallet.getOrCreateWallet(booking.attendant);
      await wallet['calculateBalanceFromBookings']();
    } catch (error) {
      console.error('Error updating wallet balance for deleted booking:', error);
      // Don't fail the deletion if wallet update fails, but log the error
    }

    // Delete the booking
    await Booking.findByIdAndDelete(req.params['id']);

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
