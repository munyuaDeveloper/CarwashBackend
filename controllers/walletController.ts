import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import Wallet from '../models/walletModel';
import SystemWallet from '../models/systemWalletModel';
import User from '../models/userModel';
import Booking from '../models/bookingModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';

const walletController = {
  // Get wallet for current attendant
  getMyWallet: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('User not authenticated', 401));
    }

    if (req.user.role !== 'attendant') {
      return next(new AppError('Only attendants can access wallet', 403));
    }

    const { date } = req.query;
    let targetDate: Date | undefined;

    // Parse date if provided
    if (date) {
      targetDate = new Date(date as string);
      if (isNaN(targetDate.getTime())) {
        return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
      }
    }

    const wallet = await Wallet.getOrCreateWallet(req.user._id);
    await wallet.populate('attendant', 'name email role');

    // If date is specified, calculate balance for that specific date (for reporting)
    // Otherwise, return stored balance
    const responseData: any = {
      wallet,
      date: targetDate ? targetDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    };

    if (targetDate) {
      const dateBalance = await wallet['calculateBalanceFromBookings'](targetDate);
      responseData.dateBalance = dateBalance;
    }

    res.status(200).json({
      status: 'success',
      data: responseData
    });
  }),

  // Get wallet for specific attendant (admin only)
  getAttendantWallet: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can access attendant wallets', 403));
    }

    const { attendantId } = req.params;
    const { date } = req.query;
    let targetDate: Date | undefined;

    if (!attendantId || !attendantId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new AppError('Invalid attendant ID format', 400));
    }

    // Parse date if provided
    if (date) {
      targetDate = new Date(date as string);
      if (isNaN(targetDate.getTime())) {
        return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
      }
    }

    // Check if attendant exists
    const attendant = await User.findById(attendantId);
    if (!attendant) {
      return next(new AppError('Attendant not found', 404));
    }

    if (attendant.role !== 'attendant') {
      return next(new AppError('User is not an attendant', 400));
    }

    const wallet = await Wallet.getOrCreateWallet(attendantId);
    await wallet.populate('attendant', 'name email role');

    // If date is specified, calculate balance for that specific date (for reporting)
    // Otherwise, return stored balance
    let dateBalance = null;
    if (targetDate) {
      dateBalance = await wallet['calculateBalanceFromBookings'](targetDate);
    }

    res.status(200).json({
      status: 'success',
      data: {
        wallet,
        date: targetDate ? targetDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        ...(dateBalance ? { dateBalance } : {})
      }
    });
  }),

  // Get all wallets (admin only)
  getAllWallets: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can access all wallets', 403));
    }

    const { date } = req.query;
    let targetDate: Date | undefined;

    // Parse date if provided
    if (date) {
      targetDate = new Date(date as string);
      if (isNaN(targetDate.getTime())) {
        return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
      }
    }

    // If date is specified, only get wallets that have unpaid bookings for that date
    if (targetDate) {
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);

      // Get attendants who have unpaid bookings for the specified date
      const attendantsWithUnpaidBookings = await Booking.aggregate([
        {
          $match: {
            status: 'completed',
            attendantPaid: false,
            createdAt: {
              $gte: startOfDay,
              $lt: endOfDay
            }
          }
        },
        {
          $group: {
            _id: '$attendant'
          }
        }
      ]);

      const attendantIds = attendantsWithUnpaidBookings.map(item => item._id);

      // Only get wallets for attendants who have unpaid bookings on that date
      const wallets = await Wallet.find({ attendant: { $in: attendantIds } })
        .populate('attendant', 'name email role')
        .sort({ createdAt: -1 });

      // Calculate balance for all wallets for the specified date
      const walletsWithBalances = [];
      for (const wallet of wallets) {
        await wallet['calculateBalanceFromBookings'](targetDate);
        // Only include wallets that have unpaid bookings for this date
        if (wallet.totalEarnings > 0) {
          walletsWithBalances.push(wallet);
        }
      }

      res.status(200).json({
        status: 'success',
        results: walletsWithBalances.length,
        data: {
          wallets: walletsWithBalances,
          date: targetDate.toISOString().split('T')[0]
        }
      });
    } else {
      // If no date specified, get all wallets with stored balances (no recalculation for performance)
      const wallets = await Wallet.find()
        .populate('attendant', 'name email role')
        .sort({ createdAt: -1 });

      res.status(200).json({
        status: 'success',
        results: wallets.length,
        data: {
          wallets,
          date: new Date().toISOString().split('T')[0]
        }
      });
    }
  }),

  // Mark attendant as paid (admin only)
  markAttendantPaid: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can mark attendants as paid', 403));
    }

    const { attendantId } = req.params;

    if (!attendantId || !attendantId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new AppError('Invalid attendant ID format', 400));
    }

    // Check if attendant exists
    const attendant = await User.findById(attendantId);
    if (!attendant) {
      return next(new AppError('Attendant not found', 404));
    }

    if (attendant.role !== 'attendant') {
      return next(new AppError('User is not an attendant', 400));
    }

    const wallet = await Wallet.getOrCreateWallet(attendantId);

    if (wallet.isPaid) {
      return next(new AppError('Attendant has already been marked as paid', 400));
    }

    // Mark all unpaid bookings for this attendant as paid
    await Booking.updateMany(
      {
        attendant: attendantId,
        attendantPaid: false,
        status: 'completed'
      },
      { attendantPaid: true }
    );

    await wallet.resetWallet();
    // Balance is now 0 after reset. New bookings will be added incrementally.
    await wallet.populate('attendant', 'name email role');

    res.status(200).json({
      status: 'success',
      message: 'Attendant marked as paid successfully',
      data: {
        wallet
      }
    });
  }),

  // Get wallet summary for admin dashboard
  getWalletSummary: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can access wallet summary', 403));
    }

    const totalWallets = await Wallet.countDocuments();
    const unpaidWallets = await Wallet.countDocuments({ isPaid: false });
    const paidWallets = await Wallet.countDocuments({ isPaid: true });

    const totalBalances = await Wallet.aggregate([
      {
        $group: {
          _id: null,
          totalBalance: { $sum: '$balance' },
          totalEarnings: { $sum: '$totalEarnings' },
          totalCommission: { $sum: '$totalCommission' },
          totalCompanyShare: { $sum: '$totalCompanyShare' }
        }
      }
    ]);

    const summary = {
      totalWallets,
      unpaidWallets,
      paidWallets,
      totalBalance: totalBalances[0]?.totalBalance || 0,
      totalEarnings: totalBalances[0]?.totalEarnings || 0,
      totalCommission: totalBalances[0]?.totalCommission || 0,
      totalCompanyShare: totalBalances[0]?.totalCompanyShare || 0
    };

    res.status(200).json({
      status: 'success',
      data: {
        summary
      }
    });
  }),

  // Get unpaid wallets (admin only)
  getUnpaidWallets: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can access unpaid wallets', 403));
    }

    const { date } = req.query;
    let targetDate: Date | undefined;

    // Parse date if provided
    if (date) {
      targetDate = new Date(date as string);
      if (isNaN(targetDate.getTime())) {
        return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
      }
    }

    // If date is specified, only get wallets that have unpaid bookings for that date
    if (targetDate) {
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);

      // Get attendants who have unpaid bookings for the specified date
      const attendantsWithUnpaidBookings = await Booking.aggregate([
        {
          $match: {
            status: 'completed',
            attendantPaid: false,
            createdAt: {
              $gte: startOfDay,
              $lt: endOfDay
            }
          }
        },
        {
          $group: {
            _id: '$attendant'
          }
        }
      ]);

      const attendantIds = attendantsWithUnpaidBookings.map(item => item._id);

      // Only get wallets for attendants who have unpaid bookings on that date
      const wallets = await Wallet.find({ attendant: { $in: attendantIds } })
        .populate('attendant', 'name email role')
        .sort({ createdAt: -1 });

      // Calculate balance for all wallets for the specified date
      const walletsWithBalances = [];
      for (const wallet of wallets) {
        await wallet['calculateBalanceFromBookings'](targetDate);
        // Only include wallets that have unpaid bookings for this date
        if (wallet.totalEarnings > 0) {
          walletsWithBalances.push(wallet);
        }
      }

      // Filter wallets that have positive balance (unpaid)
      const unpaidWallets = walletsWithBalances.filter((wallet: any) => wallet.balance > 0);

      res.status(200).json({
        status: 'success',
        results: unpaidWallets.length,
        data: {
          wallets: unpaidWallets,
          date: targetDate.toISOString().split('T')[0]
        }
      });
    } else {
      // If no date specified, get all unpaid wallets (current behavior)
      const wallets = await Wallet.find({ isPaid: false, balance: { $gt: 0 } })
        .populate('attendant', 'name email role')
        .sort({ balance: -1 });

      // Wallets already have stored balances, no need to recalculate

      res.status(200).json({
        status: 'success',
        results: wallets.length,
        data: {
          wallets,
          date: new Date().toISOString().split('T')[0]
        }
      });
    }
  }),

  // Get company debt summary (admin only)
  getCompanyDebtSummary: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can access company debt summary', 403));
    }

    const wallets = await Wallet.find({ companyDebt: { $gt: 0 } })
      .populate('attendant', 'name email role')
      .sort({ companyDebt: -1 });

    // Calculate balance for all wallets
    for (const wallet of wallets) {
      await wallet['calculateBalanceFromBookings']();
    }

    const totalDebt = wallets.reduce((sum: number, wallet: any) => sum + wallet.companyDebt, 0);

    res.status(200).json({
      status: 'success',
      results: wallets.length,
      data: {
        wallets,
        totalDebt
      }
    });
  }),

  // Get attendant debt details (admin only)
  getAttendantDebt: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can access attendant debt', 403));
    }

    const { attendantId } = req.params;

    if (!attendantId || !attendantId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new AppError('Invalid attendant ID format', 400));
    }

    // Check if attendant exists
    const attendant = await User.findById(attendantId);
    if (!attendant) {
      return next(new AppError('Attendant not found', 404));
    }

    if (attendant.role !== 'attendant') {
      return next(new AppError('User is not an attendant', 400));
    }

    const wallet = await Wallet.getOrCreateWallet(attendantId);
    // Wallet already has stored balance, no need to recalculate
    await wallet.populate('attendant', 'name email role');

    res.status(200).json({
      status: 'success',
      data: {
        wallet,
        debtSummary: {
          attendantName: attendant.name,
          attendantEmail: attendant.email,
          companyDebt: wallet.companyDebt,
          attendantBalance: wallet.balance,
          totalEarnings: wallet.totalEarnings,
          totalCommission: wallet.totalCommission,
          totalCompanyShare: wallet.totalCompanyShare
        }
      }
    });
  }),

  // Get system wallet (admin only)
  getSystemWallet: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can access system wallet', 403));
    }

    const systemWallet = await SystemWallet.getOrCreateSystemWallet();

    res.status(200).json({
      status: 'success',
      data: {
        systemWallet
      }
    });
  }),

  // Get system wallet summary (admin only)
  getSystemWalletSummary: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can access system wallet summary', 403));
    }

    const systemWallet = await SystemWallet.getOrCreateSystemWallet();

    // Get total attendant debts
    const totalAttendantDebts = await Wallet.aggregate([
      {
        $group: {
          _id: null,
          totalDebt: { $sum: '$companyDebt' }
        }
      }
    ]);

    const summary = {
      systemWallet,
      totalAttendantDebts: totalAttendantDebts[0]?.totalDebt || 0,
      netCompanyBalance: systemWallet.currentBalance - (totalAttendantDebts[0]?.totalDebt || 0)
    };

    res.status(200).json({
      status: 'success',
      data: {
        summary
      }
    });
  }),

  // Rebuild wallet balance from bookings (admin only)
  rebuildWalletBalance: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can rebuild wallet balances', 403));
    }

    const { attendantId } = req.params;

    if (!attendantId || !attendantId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new AppError('Invalid attendant ID format', 400));
    }

    // Check if attendant exists
    const attendant = await User.findById(attendantId);
    if (!attendant) {
      return next(new AppError('Attendant not found', 404));
    }

    if (attendant.role !== 'attendant') {
      return next(new AppError('User is not an attendant', 400));
    }

    const wallet = await Wallet.getOrCreateWallet(attendantId);
    await wallet['rebuildWalletBalance']();

    res.status(200).json({
      status: 'success',
      message: 'Wallet balance rebuilt successfully',
      data: {
        wallet
      }
    });
  }),

  // Get booking history for attendant
  getAttendantBookings: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('User not authenticated', 401));
    }

    const { attendantId } = req.params;
    const targetAttendantId = attendantId || req.user._id;

    // If requesting another attendant's bookings, require admin role
    if (attendantId && req.user.role !== 'admin') {
      return next(new AppError('Only admins can view other attendants\' bookings', 403));
    }

    if (attendantId && !attendantId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new AppError('Invalid attendant ID format', 400));
    }

    const bookings = await Booking.find({ attendant: targetAttendantId })
      .populate('attendant', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      data: {
        bookings
      }
    });
  }),

  // Get booking history for specific booking
  getBookingDetails: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can view booking details', 403));
    }

    const { bookingId } = req.params;

    if (!bookingId || !bookingId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new AppError('Invalid booking ID format', 400));
    }

    const booking = await Booking.findById(bookingId)
      .populate('attendant', 'name email');

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

  // Settle balances for specific attendant IDs (Admin Only)
  settleAttendantBalances: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can settle attendant balances', 403));
    }

    const { attendantIds } = req.body;

    if (!attendantIds || !Array.isArray(attendantIds) || attendantIds.length === 0) {
      return next(new AppError('Attendant IDs array is required', 400));
    }

    // Validate all attendant IDs
    for (const attendantId of attendantIds) {
      if (!attendantId.match(/^[0-9a-fA-F]{24}$/)) {
        return next(new AppError(`Invalid attendant ID format: ${attendantId}`, 400));
      }
    }

    const settledWallets = [];
    const errors = [];

    // Process each attendant
    for (const attendantId of attendantIds) {
      try {
        // Check if attendant exists
        const attendant = await User.findById(attendantId);
        if (!attendant) {
          errors.push(`Attendant not found: ${attendantId}`);
          continue;
        }

        if (attendant.role !== 'attendant') {
          errors.push(`User is not an attendant: ${attendantId}`);
          continue;
        }

        const wallet = await Wallet.getOrCreateWallet(attendantId);

        if (wallet.isPaid) {
          errors.push(`Attendant already marked as paid: ${attendantId}`);
          continue;
        }

        // Mark all unpaid bookings for this attendant as paid (today's bookings only)
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

        const updatedBookings = await Booking.updateMany(
          {
            attendant: attendantId,
            attendantPaid: false,
            status: 'completed',
            createdAt: {
              $gte: startOfDay,
              $lt: endOfDay
            }
          },
          { attendantPaid: true }
        );

        // Reset wallet
        await wallet.resetWallet();
        // Balance is now 0 after reset. New bookings will be added incrementally.
        await wallet.populate('attendant', 'name email role');

        settledWallets.push({
          attendantId,
          attendantName: attendant.name,
          attendantEmail: attendant.email,
          wallet,
          bookingsUpdated: updatedBookings.modifiedCount
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Error processing attendant ${attendantId}: ${errorMessage}`);
      }
    }

    res.status(200).json({
      status: 'success',
      message: `Settled balances for ${settledWallets.length} attendants`,
      data: {
        settledWallets,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  }),

  // Get daily wallet summary (Admin Only)
  getDailyWalletSummary: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can access daily wallet summary', 403));
    }

    const { date } = req.query;
    let targetDate: Date;

    // Parse date if provided, otherwise use current date
    if (date) {
      targetDate = new Date(date as string);
      if (isNaN(targetDate.getTime())) {
        return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
      }
    } else {
      targetDate = new Date();
    }

    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);

    // Get all attendants with completed bookings today that are not yet paid
    const attendantsWithBookings = await Booking.aggregate([
      {
        $match: {
          status: 'completed',
          attendantPaid: false,
          createdAt: {
            $gte: startOfDay,
            $lt: endOfDay
          }
        }
      },
      {
        $group: {
          _id: '$attendant',
          totalBookings: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalCommission: { $sum: { $multiply: ['$amount', 0.4] } },
          totalCompanyShare: { $sum: { $multiply: ['$amount', 0.6] } },
          attendantCashBookings: {
            $sum: {
              $cond: [{ $eq: ['$paymentType', 'attendant_cash'] }, 1, 0]
            }
          },
          attendantCashAmount: {
            $sum: {
              $cond: [{ $eq: ['$paymentType', 'attendant_cash'] }, '$amount', 0]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'attendant'
        }
      },
      {
        $unwind: '$attendant'
      },
      {
        $project: {
          attendantId: '$_id',
          attendantName: '$attendant.name',
          attendantEmail: '$attendant.email',
          totalBookings: 1,
          totalAmount: 1,
          totalCommission: 1,
          totalCompanyShare: 1,
          attendantCashBookings: 1,
          attendantCashAmount: 1,
          companyDebt: '$totalCompanyShare'
        }
      }
    ]);

    const summary = {
      date: targetDate.toISOString().split('T')[0],
      totalAttendants: attendantsWithBookings.length,
      totalBookings: attendantsWithBookings.reduce((sum, attendant) => sum + attendant.totalBookings, 0),
      totalAmount: attendantsWithBookings.reduce((sum, attendant) => sum + attendant.totalAmount, 0),
      totalCommission: attendantsWithBookings.reduce((sum, attendant) => sum + attendant.totalCommission, 0),
      totalCompanyShare: attendantsWithBookings.reduce((sum, attendant) => sum + attendant.totalCompanyShare, 0),
      attendants: attendantsWithBookings
    };

    res.status(200).json({
      status: 'success',
      data: {
        summary
      }
    });
  }),

  // Add tip or deduction to attendant wallet (admin only)
  adjustAttendantWallet: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can adjust attendant wallets', 403));
    }

    const { attendantId } = req.params;
    const { amount, type, reason } = req.body;

    // Validate attendant ID
    if (!attendantId || !attendantId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new AppError('Invalid attendant ID format', 400));
    }

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return next(new AppError('Amount must be a positive number', 400));
    }

    // Validate type
    if (!type || (type !== 'tip' && type !== 'deduction')) {
      return next(new AppError('Type must be either "tip" or "deduction"', 400));
    }

    // Check if attendant exists
    const attendant = await User.findById(attendantId);
    if (!attendant) {
      return next(new AppError('Attendant not found', 404));
    }

    if (attendant.role !== 'attendant') {
      return next(new AppError('User is not an attendant', 400));
    }

    // Get or create wallet (this will calculate balance from bookings)
    const wallet = await Wallet.getOrCreateWallet(attendantId);

    // Initialize adjustments array if it doesn't exist
    if (!(wallet as any).adjustments) {
      (wallet as any).adjustments = [];
    }

    // Add adjustment to the adjustments array
    const adjustment = {
      type: type as 'tip' | 'deduction',
      amount,
      reason: reason || null,
      adjustedBy: req.user.name,
      adjustedAt: new Date()
    };

    (wallet as any).adjustments.push(adjustment);

    // Mark adjustments array as modified so Mongoose saves it
    wallet.markModified('adjustments');

    // Save wallet to persist the adjustment
    await wallet.save();

    // Apply adjustment to balance incrementally
    if (type === 'tip') {
      wallet.balance = (wallet.balance || 0) + amount;
    } else {
      wallet.balance = (wallet.balance || 0) - amount;
    }

    // Set isPaid to false if balance is not zero
    if (wallet.balance !== 0) {
      wallet.isPaid = false;
    }

    // Save wallet with updated balance
    await wallet.save();
    await wallet.populate('attendant', 'name email role');

    res.status(200).json({
      status: 'success',
      message: `${type === 'tip' ? 'Tip' : 'Deduction'} of ${amount} ${type === 'tip' ? 'added to' : 'deducted from'} attendant wallet successfully`,
      data: {
        wallet
      }
    });
  })
};

export default walletController;