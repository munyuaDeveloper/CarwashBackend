import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import Business from '../models/businessModel';
import User from '../models/userModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import APIFeatures from '../utils/apiFeatures';

const businessController = {
  createBusiness: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { name, active, managerName, contactPhone, contactEmail, location } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return next(new AppError('Business name is required', 400));
    }

    const existingBusiness = await Business.findOne({ name: name.trim() });
    if (existingBusiness) {
      return next(new AppError('Business with this name already exists', 400));
    }

    if (contactEmail !== undefined && (typeof contactEmail !== 'string' || !contactEmail.trim())) {
      return next(new AppError('contactEmail must be a non-empty string', 400));
    }

    if (managerName !== undefined && (typeof managerName !== 'string' || !managerName.trim())) {
      return next(new AppError('managerName must be a non-empty string', 400));
    }

    if (contactPhone !== undefined && (typeof contactPhone !== 'string' || !contactPhone.trim())) {
      return next(new AppError('contactPhone must be a non-empty string', 400));
    }

    if (location !== undefined && (typeof location !== 'string' || !location.trim())) {
      return next(new AppError('location must be a non-empty string', 400));
    }

    const business = await Business.create({
      name: name.trim(),
      ...(typeof active === 'boolean' ? { active } : {}),
      ...(managerName !== undefined ? { managerName: managerName.trim() } : {}),
      ...(contactPhone !== undefined ? { contactPhone: contactPhone.trim() } : {}),
      ...(contactEmail !== undefined ? { contactEmail: contactEmail.trim().toLowerCase() } : {}),
      ...(location !== undefined ? { location: location.trim() } : {})
    });

    res.status(201).json({
      status: 'success',
      data: {
        business
      }
    });
  }),

  getAllBusinesses: catchAsync(async (req: IRequestWithUser, res: Response) => {
    const { search } = req.query;
    const baseFilter: Record<string, unknown> = {};

    if (typeof search === 'string' && search.trim().length > 0) {
      const safeSearch = search.trim();
      const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      baseFilter['$or'] = [
        { name: { $regex: searchRegex } },
        { managerName: { $regex: searchRegex } },
        { contactPhone: { $regex: searchRegex } },
        { contactEmail: { $regex: searchRegex } },
        { location: { $regex: searchRegex } }
      ];
    }

    const features = new APIFeatures(Business.find(baseFilter), req.query).filter().sort().limitFields();
    await features.paginate();
    const businesses = await features.query;
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 100);

    res.status(200).json({
      status: 'success',
      results: businesses.length,
      total: features.totalCount ?? businesses.length,
      page,
      limit,
      data: {
        businesses
      }
    });
  }),

  getBusiness: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const business = await Business.findById(req.params['id']);

    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        business
      }
    });
  }),

  updateBusiness: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { name, active, managerName, contactPhone, contactEmail, location } = req.body;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return next(new AppError('Business name must be a non-empty string', 400));
    }

    if (active !== undefined && typeof active !== 'boolean') {
      return next(new AppError('active must be a boolean', 400));
    }

    if (managerName !== undefined && (typeof managerName !== 'string' || !managerName.trim())) {
      return next(new AppError('managerName must be a non-empty string', 400));
    }

    if (contactPhone !== undefined && (typeof contactPhone !== 'string' || !contactPhone.trim())) {
      return next(new AppError('contactPhone must be a non-empty string', 400));
    }

    if (contactEmail !== undefined && (typeof contactEmail !== 'string' || !contactEmail.trim())) {
      return next(new AppError('contactEmail must be a non-empty string', 400));
    }

    if (location !== undefined && (typeof location !== 'string' || !location.trim())) {
      return next(new AppError('location must be a non-empty string', 400));
    }

    const business = await Business.findByIdAndUpdate(
      req.params['id'],
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(active !== undefined && { active }),
        ...(managerName !== undefined && { managerName: managerName.trim() }),
        ...(contactPhone !== undefined && { contactPhone: contactPhone.trim() }),
        ...(contactEmail !== undefined && { contactEmail: contactEmail.trim().toLowerCase() }),
        ...(location !== undefined && { location: location.trim() })
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        business
      }
    });
  }),

  deleteBusiness: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = req.params['id'];
    const usersCount = await User.countDocuments({ business: businessId });
    if (usersCount > 0) {
      return next(
        new AppError(
          `Cannot delete business with ${usersCount} linked user(s). Reassign or remove them first.`,
          400
        )
      );
    }

    const business = await Business.findByIdAndDelete(businessId);

    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  })
};

export default businessController;
