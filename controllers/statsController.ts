import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import Booking from '../models/bookingModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';

const statsController = {
  getStats: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('User not authenticated', 401));
    }

    const businessFilter: Record<string, unknown> = {};

    if (req.user.role !== 'system_admin') {
      const businessId = req.user.business ? req.user.business.toString() : null;
      if (!businessId) {
        return next(new AppError('User has no business assignment', 403));
      }
      businessFilter.business = businessId;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const completedMatch = { status: 'completed', ...businessFilter };

    const totalCompletedBookings = await Booking.aggregate([
      { $match: completedMatch },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const totalRevenue =
      totalCompletedBookings.length > 0 ? totalCompletedBookings[0].totalAmount * 0.6 : 0;

    const todayCompletedBookings = await Booking.aggregate([
      {
        $match: {
          ...completedMatch,
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const todayRevenue =
      todayCompletedBookings.length > 0 ? todayCompletedBookings[0].totalAmount * 0.6 : 0;

    const todayTotalBookings = await Booking.countDocuments({
      ...businessFilter,
      createdAt: {
        $gte: today,
        $lt: tomorrow
      }
    });

    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          todayRevenue: Math.round(todayRevenue * 100) / 100,
          todayTotalBookings
        }
      }
    });
  })
};

export default statsController;
