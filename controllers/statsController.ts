import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import Booking from '../models/bookingModel';
import catchAsync from '../utils/catchAsync';

const statsController = {
  getStats: catchAsync(async (_req: IRequestWithUser, res: Response, _next: NextFunction) => {
    // Get start and end of today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Calculate total revenue (60% of total completed bookings)
    const totalCompletedBookings = await Booking.aggregate([
      {
        $match: {
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const totalRevenue = totalCompletedBookings.length > 0
      ? totalCompletedBookings[0].totalAmount * 0.6
      : 0;

    // Calculate today's revenue (60% of today's completed bookings)
    const todayCompletedBookings = await Booking.aggregate([
      {
        $match: {
          status: 'completed',
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

    const todayRevenue = todayCompletedBookings.length > 0
      ? todayCompletedBookings[0].totalAmount * 0.6
      : 0;

    // Count today's total bookings (all statuses)
    const todayTotalBookings = await Booking.countDocuments({
      createdAt: {
        $gte: today,
        $lt: tomorrow
      }
    });

    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          totalRevenue: Math.round(totalRevenue * 100) / 100, // Round to 2 decimal places
          todayRevenue: Math.round(todayRevenue * 100) / 100, // Round to 2 decimal places
          todayTotalBookings
        }
      }
    });
  })
};

export default statsController;

