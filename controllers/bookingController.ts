import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import Booking from '../models/bookingModel';
import User from '../models/userModel';
import Wallet from '../models/walletModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import APIFeatures from '../utils/apiFeatures';

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
      paymentType,
      note
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

    // Add note if provided
    if (note !== undefined) {
      bookingData.note = note.trim();
    }

    // Create new booking
    const newBooking = await Booking.create(bookingData);

    // If booking is created as completed, add it to wallet balance
    // Otherwise, wallet balance remains unchanged (starts at 0)
    if (newBooking.status === 'completed') {
      try {
        const wallet = await Wallet.getOrCreateWallet(attendant);
        wallet.isPaid = false;
        await wallet['addCompletedBooking'](newBooking.amount, newBooking.paymentType);
      } catch (error) {
        console.error('Error updating wallet balance:', error);
        // Don't fail the booking creation if wallet update fails
      }
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

  getAllBookings: catchAsync(async (req: IRequestWithUser, res: Response, _next: NextFunction) => {
    // Use APIFeatures for searching, filtering, sorting, field limiting and pagination
    const features = new APIFeatures(
      Booking.find().populate('attendant', 'name email role'),
      req.query
    )
      .search()
      .filter()
      .sort()
      .limitFields();

    await features.paginate();

    const bookings = await features.query;

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      total: features.totalCount || 0,
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
      status,
      note
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
    const originalAttendant = originalBooking.attendant;

    // Check if wallet-affecting fields have changed
    const amountChanged = amount !== undefined && amount !== originalBooking.amount;
    const attendantChanged = attendant !== undefined && attendant.toString() !== originalAttendant.toString();
    const paymentTypeChanged = paymentType !== undefined && paymentType !== originalBooking.paymentType;
    const statusChanged = status !== undefined && status !== originalBooking.status;
    const statusChangedToCompleted = statusChanged && status === 'completed';
    const statusChangedFromCompleted = statusChanged && originalBooking.status === 'completed' && status !== 'completed';
    const wasCompleted = originalBooking.status === 'completed';
    const finalAmount = amount !== undefined ? amount : originalBooking.amount;
    const finalPaymentType = paymentType !== undefined ? paymentType : originalBooking.paymentType;

    // Update wallet balances incrementally
    try {
      // Case 1: Status changed from completed to something else - remove from wallet
      if (statusChangedFromCompleted) {
        const originalWallet = await Wallet.getOrCreateWallet(originalAttendant);
        await originalWallet['removeCompletedBooking'](originalBooking.amount, originalBooking.paymentType);
      }

      // Case 2: Status changed to completed - add to wallet
      if (statusChangedToCompleted) {
        const targetWallet = await Wallet.getOrCreateWallet(finalAttendant);
        await targetWallet['addCompletedBooking'](finalAmount, finalPaymentType);
      }

      // Case 3: Booking was completed and amount/paymentType changed - update incrementally
      if (wasCompleted && !statusChanged && (amountChanged || paymentTypeChanged)) {
        const originalWallet = await Wallet.getOrCreateWallet(originalAttendant);
        // Remove old booking contribution
        await originalWallet['removeCompletedBooking'](originalBooking.amount, originalBooking.paymentType);
        // Add new booking contribution
        await originalWallet['addCompletedBooking'](finalAmount, finalPaymentType);
      }

      // Case 4: Booking was completed and attendant changed - move between wallets
      if (wasCompleted && attendantChanged) {
        // Remove from original attendant's wallet
        const originalWallet = await Wallet.getOrCreateWallet(originalAttendant);
        await originalWallet['removeCompletedBooking'](finalAmount, finalPaymentType);
        // Add to new attendant's wallet
        const newWallet = await Wallet.getOrCreateWallet(finalAttendant);
        await newWallet['addCompletedBooking'](finalAmount, finalPaymentType);
      }

      // Case 5: Booking was completed, attendant changed, AND amount/paymentType changed
      if (wasCompleted && attendantChanged && (amountChanged || paymentTypeChanged)) {
        // Remove old booking from original attendant
        const originalWallet = await Wallet.getOrCreateWallet(originalAttendant);
        await originalWallet['removeCompletedBooking'](originalBooking.amount, originalBooking.paymentType);
        // Add new booking to new attendant
        const newWallet = await Wallet.getOrCreateWallet(finalAttendant);
        await newWallet['addCompletedBooking'](finalAmount, finalPaymentType);
      }
    } catch (error) {
      console.error('Error updating wallet balances:', error);
      // Don't fail the booking update if wallet update fails, but log the error
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
        ...(status && { status }),
        ...(note !== undefined && { note: note ? note.trim() : null })
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

    // Remove booking from wallet balance if it was completed
    if (booking.status === 'completed') {
      try {
        const wallet = await Wallet.getOrCreateWallet(booking.attendant);
        await wallet['removeCompletedBooking'](booking.amount, booking.paymentType);
      } catch (error) {
        console.error('Error updating wallet balance for deleted booking:', error);
        // Don't fail the deletion if wallet update fails, but log the error
      }
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
