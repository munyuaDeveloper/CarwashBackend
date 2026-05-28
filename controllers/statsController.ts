import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { IRequestWithUser } from '../types';
import Booking from '../models/bookingModel';
import Business from '../models/businessModel';
import User from '../models/userModel';
import Wallet from '../models/walletModel';
import SmsTemplate from '../models/smsTemplateModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import { userHasRole } from '../utils/userRoles';

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const percentChange = (current: number, previous: number): number => {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 100);
  }
  return current > 0 ? 100 : 0;
};

const getVehicleLabel = (booking: {
  category?: string;
  carRegistrationNumber?: string;
  customerName?: string;
  color?: string;
  vehicle?:
    | { plate?: string; vehicleType?: string }
    | mongoose.Types.ObjectId
    | string
    | null;
}): string => {
  const vehicle = booking.vehicle;
  if (vehicle && typeof vehicle === 'object' && !(vehicle instanceof mongoose.Types.ObjectId)) {
    const populatedVehicle = vehicle as { plate?: string; vehicleType?: string };
    const plate = populatedVehicle.plate ?? '';
    const vehicleType = populatedVehicle.vehicleType?.trim();
    return vehicleType ? `${plate} (${vehicleType})` : plate || 'Vehicle';
  }
  if (booking.category === 'carpet') {
    return booking.color?.trim() || booking.customerName?.trim() || 'Carpet service';
  }
  return booking.carRegistrationNumber?.trim() || booking.customerName?.trim() || 'N/A';
};

const getServiceLabel = (booking: {
  serviceType?: string;
  category?: string;
}): string => {
  if (booking.serviceType?.trim()) {
    return booking.serviceType
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  return booking.category === 'carpet' ? 'Carpet' : 'Vehicle wash';
};

const statsController = {
  getStats: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('User not authenticated', 401));
    }

    const businessFilter: Record<string, unknown> = {};
    let businessId: string | null = null;

    if (!userHasRole(req.user, 'system_admin')) {
      businessId = req.user.business ? req.user.business.toString() : null;
      if (!businessId) {
        return next(new AppError('User has no business assignment', 403));
      }
      businessFilter['business'] = businessId;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayRange = { $gte: today, $lt: tomorrow };
    const yesterdayRange = { $gte: yesterday, $lt: today };
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
          createdAt: todayRange
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const todayGrossRevenue =
      todayCompletedBookings.length > 0 ? todayCompletedBookings[0].totalAmount : 0;
    const todayCompletedCount =
      todayCompletedBookings.length > 0 ? todayCompletedBookings[0].count : 0;

    const todayRevenue = todayGrossRevenue * 0.6;

    const todayTotalBookings = await Booking.countDocuments({
      ...businessFilter,
      createdAt: todayRange
    });

    const yesterdayTotalBookings = await Booking.countDocuments({
      ...businessFilter,
      createdAt: yesterdayRange
    });

    const bookingsChangePercent =
      yesterdayTotalBookings > 0
        ? Math.round(((todayTotalBookings - yesterdayTotalBookings) / yesterdayTotalBookings) * 100)
        : todayTotalBookings > 0
          ? 100
          : 0;

    const avgTicketToday =
      todayCompletedCount > 0 ? roundMoney(todayGrossRevenue / todayCompletedCount) : 0;

    const [pendingCount, inProgressCount, completedCount, cancelledCount] = await Promise.all([
      Booking.countDocuments({ ...businessFilter, status: 'pending', createdAt: todayRange }),
      Booking.countDocuments({ ...businessFilter, status: 'in progress', createdAt: todayRange }),
      Booking.countDocuments({ ...businessFilter, status: 'completed', createdAt: todayRange }),
      Booking.countDocuments({ ...businessFilter, status: 'cancelled', createdAt: todayRange })
    ]);

    let totalAttendants = 0;
    let activeAttendants = 0;
    let idleAttendants = 0;
    let pendingWalletSettlements = 0;

    if (businessId) {
      totalAttendants = await User.countDocuments({
        business: businessId,
        roles: 'attendant',
        active: { $ne: false }
      });

      const activeAttendantIds = await Booking.distinct('attendant', {
        business: businessId,
        status: 'in progress',
        createdAt: todayRange
      });
      activeAttendants = activeAttendantIds.filter(Boolean).length;
      idleAttendants = Math.max(totalAttendants - activeAttendants, 0);

      const attendantIds = await User.find({ business: businessId, roles: 'attendant' }).distinct('_id');
      if (attendantIds.length > 0) {
        pendingWalletSettlements = await Wallet.countDocuments({
          attendant: { $in: attendantIds },
          isPaid: false
        });
      }
    }

    const recentBookingsRaw = await Booking.find(businessFilter)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('vehicle', 'plate vehicleType')
      .select(
        'carRegistrationNumber customerName color category serviceType status amount createdAt vehicle'
      );

    const recentBookings = recentBookingsRaw.map((booking) => {
      const bookingRecord = booking.toObject() as {
        category?: string;
        carRegistrationNumber?: string;
        customerName?: string;
        color?: string;
        vehicle?: { plate?: string; vehicleType?: string } | mongoose.Types.ObjectId | string | null;
      };

      return {
        _id: booking._id.toString(),
        shortId: booking._id.toString().slice(-4).toUpperCase(),
        vehicleLabel: getVehicleLabel(bookingRecord),
        serviceLabel: getServiceLabel(bookingRecord),
        status: booking.status,
        amount: booking.amount
      };
    });

    const attendantPerformanceRaw = await Booking.aggregate([
      {
        $match: {
          ...businessFilter,
          status: 'completed',
          createdAt: todayRange,
          attendant: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$attendant',
          revenue: { $sum: '$amount' },
          completedBookings: { $sum: 1 }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'attendant'
        }
      },
      { $unwind: '$attendant' },
      {
        $project: {
          _id: 0,
          name: '$attendant.name',
          revenue: 1,
          completedBookings: 1
        }
      }
    ]);

    const attendantPerformance = attendantPerformanceRaw.map((row) => ({
      name: row.name as string,
      revenue: roundMoney(row.revenue as number),
      completedBookings: row.completedBookings as number
    }));

    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          totalRevenue: roundMoney(totalRevenue),
          todayRevenue: roundMoney(todayRevenue),
          todayGrossRevenue: roundMoney(todayGrossRevenue),
          todayTotalBookings,
          yesterdayTotalBookings,
          bookingsChangePercent,
          avgTicketToday,
          statusBreakdown: {
            pending: pendingCount,
            inProgress: inProgressCount,
            completed: completedCount,
            cancelled: cancelledCount
          },
          totalAttendants,
          activeAttendants,
          idleAttendants,
          pendingWalletSettlements,
          recentBookings,
          attendantPerformance
        }
      }
    });
  }),

  getSystemOverview: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('User not authenticated', 401));
    }
    if (!userHasRole(req.user, 'system_admin')) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 7);

    const monthRange = { $gte: monthStart, $lt: nextMonthStart };
    const lastMonthRange = { $gte: lastMonthStart, $lt: monthStart };
    const todayRange = { $gte: today, $lt: tomorrow };

    const [
      activeBusinesses,
      inactiveBusinesses,
      totalBusinesses,
      newBusinessesThisWeek,
      totalUsers,
      businessAdminUsers,
      attendantUsers,
      bookingsToday,
      cancelledMtd,
      pendingSmsTemplates,
      pendingWalletSettlements,
      revenueMtdAgg,
      revenueLastMonthAgg,
      businessesCreatedThisMonth,
      businessesCreatedLastMonth,
      adminBusinessIds
    ] = await Promise.all([
      Business.countDocuments({ active: true }),
      Business.countDocuments({ active: false }),
      Business.countDocuments(),
      Business.countDocuments({ createdAt: { $gte: weekStart } }),
      User.countDocuments({ roles: { $nin: ['system_admin'] }, active: { $ne: false } }),
      User.countDocuments({ roles: 'business_admin', active: { $ne: false } }),
      User.countDocuments({ roles: 'attendant', active: { $ne: false } }),
      Booking.countDocuments({ createdAt: todayRange }),
      Booking.countDocuments({ status: 'cancelled', createdAt: monthRange }),
      SmsTemplate.countDocuments({ status: 'pending_review' }),
      Wallet.countDocuments({ isPaid: false }),
      Booking.aggregate([
        { $match: { status: 'completed', createdAt: monthRange } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
      ]),
      Booking.aggregate([
        { $match: { status: 'completed', createdAt: lastMonthRange } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
      ]),
      Business.countDocuments({ createdAt: monthRange }),
      Business.countDocuments({ createdAt: lastMonthRange }),
      User.distinct('business', { roles: 'business_admin', business: { $ne: null } })
    ]);

    const revenueMtd = revenueMtdAgg.length > 0 ? revenueMtdAgg[0].totalAmount : 0;
    const revenueLastMonth = revenueLastMonthAgg.length > 0 ? revenueLastMonthAgg[0].totalAmount : 0;
    const businessesWithoutAdmin = await Business.countDocuments({
      _id: { $nin: adminBusinessIds }
    });
    const pendingSetup = inactiveBusinesses + businessesWithoutAdmin;

    const usersByBusinessRaw = await User.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      {
        $match: {
          roles: { $nin: ['system_admin'] },
          business: { $exists: true, $ne: null },
          active: { $ne: false }
        }
      },
      { $group: { _id: '$business', count: { $sum: 1 } } }
    ]);

    const usersByBusiness: Record<string, number> = {};
    usersByBusinessRaw.forEach((row) => {
      usersByBusiness[row._id.toString()] = row.count;
    });

    const topBusinessesRaw = await Booking.aggregate<{
      businessName: string;
      bookings: number;
      revenue: number;
    }>([
      { $match: { createdAt: monthRange } },
      {
        $group: {
          _id: '$business',
          bookings: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0]
            }
          }
        }
      },
      { $sort: { bookings: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'businesses',
          localField: '_id',
          foreignField: '_id',
          as: 'business'
        }
      },
      { $unwind: '$business' },
      {
        $project: {
          _id: 0,
          businessName: '$business.name',
          bookings: 1,
          revenue: 1
        }
      }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        overview: {
          activeBusinesses,
          inactiveBusinesses,
          totalBusinesses,
          pendingSetup,
          businessesWithoutAdmin,
          businessesChangePercent: percentChange(businessesCreatedThisMonth, businessesCreatedLastMonth),
          totalUsers,
          businessAdminUsers,
          attendantUsers,
          revenueMtd: roundMoney(revenueMtd),
          revenueChangePercent: percentChange(revenueMtd, revenueLastMonth),
          bookingsToday,
          cancelledMtd,
          pendingSmsTemplates,
          pendingWalletSettlements,
          newBusinessesThisWeek,
          usersByBusiness,
          topBusinessesByBookingsMtd: topBusinessesRaw.map((row) => ({
            name: row.businessName,
            bookings: row.bookings,
            revenue: roundMoney(row.revenue)
          }))
        }
      }
    });
  })
};

export default statsController;
