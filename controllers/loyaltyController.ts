import { NextFunction, Response } from 'express';
import { IRequestWithUser } from '../types';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import Business from '../models/businessModel';
import SmsTemplate from '../models/smsTemplateModel';
import LoyaltyProfile from '../models/loyaltyProfileModel';
import SmsLog from '../models/smsLogModel';

const TEMPLATE_TYPES = ['loyalty_progress', 'reward_achievement'];
const TEMPLATE_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'disabled'];

const getBusinessContext = (req: IRequestWithUser): string | null =>
  req.user?.role === 'system_admin' || req.user?.role === 'admin'
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
    const query: Record<string, unknown> = {};
    if (businessId) query['business'] = businessId;
    if (req.user?.role !== 'system_admin' && req.user?.role !== 'admin' && !businessId) {
      return next(new AppError('Business context is required', 400));
    }
    const logs = await SmsLog.find(query).sort({ createdAt: -1 }).limit(200);
    res.status(200).json({
      status: 'success',
      results: logs.length,
      data: { logs }
    });
  })
};

export default loyaltyController;
