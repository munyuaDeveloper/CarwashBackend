import { NextFunction, Response } from 'express';
import mongoose from 'mongoose';
import { IRequestWithUser } from '../types';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import APIFeatures from '../utils/apiFeatures';
import Business from '../models/businessModel';
import SmsTemplate from '../models/smsTemplateModel';
import LoyaltyProfile from '../models/loyaltyProfileModel';
import SmsLog from '../models/smsLogModel';
import { userHasAnyRole, userHasRole } from '../utils/userRoles';

const TEMPLATE_TYPES = ['loyalty_progress', 'reward_achievement'];
const TEMPLATE_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'disabled'];

const getBusinessContext = (req: IRequestWithUser): string | null =>
  userHasAnyRole(req.user, ['system_admin', 'admin'])
    ? (typeof req.query['businessId'] === 'string' ? req.query['businessId'] : null)
    : (req.user?.business ? req.user.business.toString() : null);

const loyaltyController = {
  getBusinessLoyaltyConfig: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = req.params['businessId'] || getBusinessContext(req);
    if (!businessId) {
      return next(new AppError('Business context is required', 400));
    }
    const business = await Business.findById(businessId).select('name loyaltySettings');
    if (!business) {
      return next(new AppError('Business not found', 404));
    }
    res.status(200).json({
      status: 'success',
      data: {
        businessId,
        loyaltySettings: business['loyaltySettings']
      }
    });
  }),

  updateBusinessLoyaltyConfig: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = req.params['businessId'] || getBusinessContext(req);
    if (!businessId) {
      return next(new AppError('Business context is required', 400));
    }

    const {
      enabled,
      washesRequired,
      rewardType,
      smsEnabled,
      allowRewardWashToAccrue
    } = req.body as {
      enabled?: boolean;
      washesRequired?: number;
      rewardType?: string;
      smsEnabled?: boolean;
      allowRewardWashToAccrue?: boolean;
    };

    if (washesRequired !== undefined && (!Number.isFinite(washesRequired) || washesRequired < 1)) {
      return next(new AppError('washesRequired must be a positive number', 400));
    }

    const business = await Business.findByIdAndUpdate(
      businessId,
      {
        ...(enabled !== undefined ? { 'loyaltySettings.enabled': enabled } : {}),
        ...(washesRequired !== undefined ? { 'loyaltySettings.washesRequired': washesRequired } : {}),
        ...(rewardType !== undefined ? { 'loyaltySettings.rewardType': String(rewardType).trim() } : {}),
        ...(smsEnabled !== undefined ? { 'loyaltySettings.smsEnabled': smsEnabled } : {}),
        ...(allowRewardWashToAccrue !== undefined
          ? { 'loyaltySettings.allowRewardWashToAccrue': allowRewardWashToAccrue }
          : {})
      },
      { new: true, runValidators: true }
    ).select('name loyaltySettings');

    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        loyaltySettings: business['loyaltySettings']
      }
    });
  }),

  getSmsTemplates: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = getBusinessContext(req);
    if (!businessId) {
      return next(new AppError('Business context is required', 400));
    }
    const templates = await SmsTemplate.find({ business: businessId }).sort({ updatedAt: -1 });
    res.status(200).json({
      status: 'success',
      results: templates.length,
      data: { templates }
    });
  }),

  upsertSmsTemplate: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = getBusinessContext(req);
    if (!businessId) {
      return next(new AppError('Business context is required', 400));
    }
    const { type, content, submitForReview } = req.body as {
      type?: string;
      content?: string;
      submitForReview?: boolean;
    };
    if (!type || !TEMPLATE_TYPES.includes(type)) {
      return next(new AppError('Invalid template type', 400));
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return next(new AppError('Template content is required', 400));
    }
    const nextStatus = submitForReview ? 'pending_review' : 'draft';
    const update: Record<string, unknown> = {
      content: content.trim(),
      status: nextStatus,
      ...(nextStatus === 'pending_review' ? { rejectionReason: null } : {})
    };
    const template = await SmsTemplate.findOneAndUpdate(
      { business: businessId, type },
      {
        $set: update,
        $push: {
          auditTrail: {
            action: submitForReview ? 'submitted' : 'updated',
            createdAt: new Date()
          }
        }
      },
      { upsert: true, new: true, runValidators: true }
    );
    res.status(200).json({
      status: 'success',
      data: { template }
    });
  }),

  reviewSmsTemplate: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { action, comment } = req.body as { action?: 'approve' | 'reject' | 'disable'; comment?: string };
    if (!id) return next(new AppError('Template id is required', 400));
    if (!action || !['approve', 'reject', 'disable'].includes(action)) {
      return next(new AppError('action must be approve, reject, or disable', 400));
    }
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'disabled';
    const template = await SmsTemplate.findByIdAndUpdate(
      id,
      {
        status,
        lastReviewedBy: req.user?._id,
        lastReviewedAt: new Date(),
        rejectionReason: status === 'rejected' ? (comment || 'Rejected by reviewer') : null,
        $push: {
          auditTrail: {
            action: status,
            reviewedBy: req.user?._id,
            comment,
            createdAt: new Date()
          }
        }
      },
      { new: true, runValidators: true }
    );
    if (!template) return next(new AppError('Template not found', 404));
    res.status(200).json({
      status: 'success',
      data: { template }
    });
  }),

  getPendingTemplates: catchAsync(async (_req: IRequestWithUser, res: Response) => {
    const templates = await SmsTemplate.find({ status: 'pending_review' })
      .populate('business', 'name')
      .sort({ updatedAt: -1 });
    res.status(200).json({
      status: 'success',
      results: templates.length,
      data: { templates }
    });
  }),

  getTemplateQueue: catchAsync(async (_req: IRequestWithUser, res: Response) => {
    const stats = await Promise.all(
      TEMPLATE_STATUSES.map(async (status) => ({
        status,
        count: await SmsTemplate.countDocuments({ status })
      }))
    );
    res.status(200).json({
      status: 'success',
      data: { stats }
    });
  }),

  updateCustomerConsent: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = getBusinessContext(req);
    if (!businessId) {
      return next(new AppError('Business context is required', 400));
    }
    const { vehicleIdentifier, smsConsent, customerPhoneNumber } = req.body as {
      vehicleIdentifier?: string;
      smsConsent?: boolean;
      customerPhoneNumber?: string;
    };
    if (!vehicleIdentifier || typeof vehicleIdentifier !== 'string' || !vehicleIdentifier.trim()) {
      return next(new AppError('vehicleIdentifier is required', 400));
    }
    if (typeof smsConsent !== 'boolean') {
      return next(new AppError('smsConsent must be a boolean', 400));
    }
    const normalizedVehicleIdentifier = vehicleIdentifier.toUpperCase().trim();
    const profile = await LoyaltyProfile.findOneAndUpdate(
      { business: businessId, vehicleIdentifier: normalizedVehicleIdentifier },
      {
        $set: {
          smsConsent,
          ...(customerPhoneNumber ? { customerPhoneNumber: customerPhoneNumber.trim() } : {})
        },
        $setOnInsert: {
          business: businessId,
          vehicleIdentifier: normalizedVehicleIdentifier
        }
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      status: 'success',
      data: { profile }
    });
  }),

  getBusinessLoyaltyReport: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = getBusinessContext(req);
    if (!businessId) {
      return next(new AppError('Business context is required', 400));
    }
    const totalMembers = await LoyaltyProfile.countDocuments({ business: businessId });
    const profileStats = await LoyaltyProfile.aggregate([
      { $match: { business: (await Business.findById(businessId))?._id } },
      {
        $group: {
          _id: null,
          totalRewardsEarned: { $sum: '$totalRewardsEarned' },
          totalRewardsRedeemed: { $sum: '$totalRewardsRedeemed' },
          pendingRewards: { $sum: '$pendingRewards' }
        }
      }
    ]);
    const smsStats = await SmsLog.aggregate([
      { $match: { business: (await Business.findById(businessId))?._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        totalMembers,
        totalRewardsEarned: profileStats[0]?.['totalRewardsEarned'] || 0,
        totalRewardsRedeemed: profileStats[0]?.['totalRewardsRedeemed'] || 0,
        pendingRewards: profileStats[0]?.['pendingRewards'] || 0,
        smsDeliveryStats: smsStats
      }
    });
  }),

  getSmsLogs: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = getBusinessContext(req);
    const baseFilter: Record<string, unknown> = {};
    if (businessId) baseFilter['business'] = businessId;
    if (!userHasAnyRole(req.user, ['system_admin', 'admin']) && !businessId) {
      return next(new AppError('Business context is required', 400));
    }

    const { search } = req.query;
    if (typeof search === 'string' && search.trim().length > 0) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      baseFilter['$or'] = [
        { recipientPhone: { $regex: searchRegex } },
        { message: { $regex: searchRegex } },
        { gatewayMessageId: { $regex: searchRegex } },
        { deliveryDescription: { $regex: searchRegex } },
        { errorMessage: { $regex: searchRegex } },
        { status: { $regex: searchRegex } }
      ];
    }

    const queryForFeatures = { ...req.query } as Record<string, unknown>;
    delete queryForFeatures['businessId'];
    if (queryForFeatures['status'] === 'all') delete queryForFeatures['status'];
    const SMS_LOG_STATUSES = ['queued', 'sent', 'delivered', 'failed', 'skipped'];
    if (
      typeof queryForFeatures['status'] === 'string' &&
      !SMS_LOG_STATUSES.includes(queryForFeatures['status'])
    ) {
      delete queryForFeatures['status'];
    }

    const features = new APIFeatures(
      SmsLog.find(baseFilter).populate('business', 'name'),
      queryForFeatures
    )
      .filter()
      .sort()
      .limitFields();

    await features.paginate();

    const logs = await features.query;
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 20);

    res.status(200).json({
      status: 'success',
      results: logs.length,
      total: features.totalCount ?? logs.length,
      page,
      limit,
      data: { logs }
    });
  }),

  getMonthlySmsUsage: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const parsedYear = Number(req.query['year']);
    const year =
      Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
        ? parsedYear
        : new Date().getFullYear();

    const businessId = getBusinessContext(req);
    if (userHasRole(req.user, 'business_admin') && !businessId) {
      return next(new AppError('Business context is required', 400));
    }

    const rangeStart = new Date(year, 0, 1);
    const rangeEnd = new Date(year + 1, 0, 1);

    const matchFilter: Record<string, unknown> = {
      createdAt: { $gte: rangeStart, $lt: rangeEnd },
      status: { $nin: ['skipped'] }
    };

    if (businessId) {
      if (!mongoose.Types.ObjectId.isValid(businessId)) {
        return next(new AppError('Invalid business ID', 400));
      }
      matchFilter['business'] = new mongoose.Types.ObjectId(businessId);
    }

    const grouped = await SmsLog.aggregate<{
      _id: { business: mongoose.Types.ObjectId; month: number };
      count: number;
      delivered: number;
    }>([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            business: '$business',
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          delivered: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.business': 1, '_id.month': 1 } }
    ]);

    const businessIds = [
      ...new Set(grouped.map((row) => row._id.business.toString()))
    ];

    const businesses = businessIds.length
      ? await Business.find({ _id: { $in: businessIds } }).select('name')
      : [];

    const businessNameById = new Map(
      businesses.map((business) => [business._id.toString(), business['name'] as string])
    );

    const rowsMap = new Map<
      string,
      {
        businessId: string;
        businessName: string;
        months: Record<string, number>;
        deliveredByMonth: Record<string, number>;
        total: number;
        deliveredTotal: number;
      }
    >();

    for (const entry of grouped) {
      const id = entry._id.business.toString();
      if (!rowsMap.has(id)) {
        rowsMap.set(id, {
          businessId: id,
          businessName: businessNameById.get(id) ?? 'Unknown business',
          months: {},
          deliveredByMonth: {},
          total: 0,
          deliveredTotal: 0
        });
      }

      const row = rowsMap.get(id)!;
      const monthKey = String(entry._id.month);
      row.months[monthKey] = entry.count;
      row.deliveredByMonth[monthKey] = entry.delivered;
      row.total += entry.count;
      row.deliveredTotal += entry.delivered;
    }

    const monthTotals: Record<string, number> = {};
    const deliveredMonthTotals: Record<string, number> = {};
    for (let month = 1; month <= 12; month += 1) {
      const key = String(month);
      monthTotals[key] = 0;
      deliveredMonthTotals[key] = 0;
    }

    for (const row of rowsMap.values()) {
      for (const [monthKey, count] of Object.entries(row.months)) {
        monthTotals[monthKey] = (monthTotals[monthKey] ?? 0) + count;
      }
      for (const [monthKey, count] of Object.entries(row.deliveredByMonth)) {
        deliveredMonthTotals[monthKey] = (deliveredMonthTotals[monthKey] ?? 0) + count;
      }
    }

    const rows = Array.from(rowsMap.values()).sort((a, b) =>
      a.businessName.localeCompare(b.businessName)
    );

    const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
    const deliveredGrandTotal = rows.reduce((sum, row) => sum + row.deliveredTotal, 0);

    res.status(200).json({
      status: 'success',
      data: {
        year,
        rows,
        monthTotals,
        deliveredMonthTotals,
        grandTotal,
        deliveredGrandTotal
      }
    });
  })
};

export default loyaltyController;
