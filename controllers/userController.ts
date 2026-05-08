import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import mongoose from 'mongoose';
import User from '../models/userModel';
import Business from '../models/businessModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import APIFeatures from '../utils/apiFeatures';

const VALID_USER_ROLES = ['attendant', 'admin', 'system_admin', 'business_admin'];

// Placeholder TypeScript controller - convert from JS as needed
const userController = {
  getMe: (req: IRequestWithUser, _res: Response, next: NextFunction) => {
    // Implementation from JS file
    req.params['id'] = req.user?._id || '';
    next();
  },

  getUser: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const user = await User.findById(req.params['id']).populate('business', 'name');

    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    if (req.user?.role === 'business_admin') {
      if (user.role === 'system_admin') {
        return next(
          new AppError('You do not have permission to view this user', 403)
        );
      }
      const requesterBusinessId = req.user.business ? req.user.business.toString() : null;
      const targetBusinessId = user.business ? user.business.toString() : null;
      if (!requesterBusinessId || requesterBusinessId !== targetBusinessId) {
        return next(
          new AppError('You do not have permission to view this user', 403)
        );
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        user
      }
    });
  }),

  getAllUsers: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    // Extract role filter from query parameters
    const { role, search } = req.query;

    // Build filter object
    const filter: any = {};

    // Add role filter if provided
    if (role) {
      // Validate role parameter
      if (!VALID_USER_ROLES.includes(role as string)) {
        return next(
          new AppError(
            'Role must be one of "attendant", "admin", "system_admin", or "business_admin"',
            400
          )
        );
      }
      filter.role = role;
    }

    // Add name/email search if provided
    if (typeof search === 'string' && search.trim().length > 0) {
      const safeSearch = search.trim();
      const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');

      const orFilters: any[] = [
        { name: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
        { role: { $regex: searchRegex } }
      ];

      // Support direct lookup by user/business ObjectId
      if (mongoose.Types.ObjectId.isValid(safeSearch)) {
        orFilters.push({ _id: safeSearch });
        orFilters.push({ business: safeSearch });
      }

      // Support search by business name
      const matchingBusinesses = await Business.find({ name: { $regex: searchRegex } }).select('_id');
      if (matchingBusinesses.length > 0) {
        orFilters.push({
          business: { $in: matchingBusinesses.map((business) => business._id) }
        });
      }

      filter.$or = orFilters;
    }

    if (req.user?.role === 'business_admin') {
      const requesterBusinessId = req.user.business ? req.user.business.toString() : null;
      if (!requesterBusinessId) {
        return next(new AppError('Business admin is missing business assignment', 403));
      }
      filter.business = requesterBusinessId;

      if (!role) {
        filter.role = { $ne: 'system_admin' };
      } else if (role === 'system_admin') {
        res.status(200).json({
          status: 'success',
          results: 0,
          data: {
            users: []
          }
        });
        return;
      }
    }

    const features = new APIFeatures(
      User.find(filter).populate('business', 'name'),
      req.query
    )
      .sort()
      .limitFields();

    await features.paginate();

    const users = await features.query;
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 100);

    res.status(200).json({
      status: 'success',
      results: users.length,
      total: features.totalCount ?? users.length,
      page,
      limit,
      data: {
        users
      }
    });
  }),

  createUser: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { name, email, password, passwordConfirm, role, photo, business } = req.body;

    // Validate required fields
    if (!name || !email || !password || !passwordConfirm) {
      return next(new AppError('Name, email, password, and passwordConfirm are required', 400));
    }

    // Validate password confirmation
    if (password !== passwordConfirm) {
      return next(new AppError('Passwords do not match', 400));
    }

    // Validate role if provided
    if (role && !VALID_USER_ROLES.includes(role)) {
      return next(
        new AppError(
          'Role must be one of "attendant", "admin", "system_admin", or "business_admin"',
          400
        )
      );
    }

    const targetRole = role || 'attendant';
    const requesterRole = req.user?.role;
    const requesterBusinessId = req.user?.business ? req.user.business.toString() : null;

    if (requesterRole === 'business_admin') {
      if (targetRole === 'system_admin') {
        return next(new AppError('business_admin cannot create system_admin users', 403));
      }
      if (!requesterBusinessId) {
        return next(new AppError('Business admin is missing business assignment', 403));
      }
    }

    const effectiveBusiness =
      requesterRole === 'business_admin'
        ? requesterBusinessId
        : (targetRole === 'system_admin' ? null : business);

    if (targetRole !== 'system_admin' && !effectiveBusiness) {
      return next(new AppError('business is required for non-system_admin users', 400));
    }

    if (effectiveBusiness) {
      if (!effectiveBusiness.match(/^[0-9a-fA-F]{24}$/)) {
        return next(new AppError('Invalid business ID format', 400));
      }
      const businessExists = await Business.findById(effectiveBusiness);
      if (!businessExists) {
        return next(new AppError('Business not found', 404));
      }
    }

    // Create new user
    const newUser = await User.create({
      name,
      email,
      password,
      passwordConfirm,
      role: targetRole,
      photo: photo || 'default.jpg',
      business: effectiveBusiness
    });

    // Remove password from output
    const userOutput = {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      photo: newUser.photo,
      active: newUser.active
    };

    res.status(201).json({
      status: 'success',
      data: {
        user: userOutput
      }
    });
  }),

  updateUser: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { name, email, role, photo, business } = req.body;

    // Validate role if provided
    if (role && !VALID_USER_ROLES.includes(role)) {
      return next(
        new AppError(
          'Role must be one of "attendant", "admin", "system_admin", or "business_admin"',
          400
        )
      );
    }

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(new AppError('Please provide a valid email', 400));
    }

    if (business && !business.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new AppError('Invalid business ID format', 400));
    }

    if (business) {
      const businessExists = await Business.findById(business);
      if (!businessExists) {
        return next(new AppError('Business not found', 404));
      }
    }

    const existingUser = await User.findById(req.params['id']);
    if (!existingUser) {
      return next(new AppError('No user found with that ID', 404));
    }

    const targetRole = role || existingUser.role;
    const targetBusiness = business !== undefined ? business : existingUser.business;

    if (targetRole !== 'system_admin' && !targetBusiness) {
      return next(new AppError('business is required for non-system_admin users', 400));
    }

    const user = await User.findByIdAndUpdate(
      req.params['id'],
      {
        ...(name && { name }),
        ...(email && { email }),
        ...(role && { role }),
        ...(photo && { photo }),
        ...(role === 'system_admin' && { business: null }),
        ...(business !== undefined && { business: targetRole === 'system_admin' ? null : business })
      },
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      status: 'success',
      data: {
        user
      }
    });
  }),

  deleteUser: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const user = await User.findById(req.params['id']);

    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    if (req.user?.role === 'business_admin') {
      if (user.role === 'system_admin') {
        return next(new AppError('You do not have permission to delete this user', 403));
      }

      const requesterBusinessId = req.user.business ? req.user.business.toString() : null;
      const targetBusinessId = user.business ? user.business.toString() : null;
      if (!requesterBusinessId || requesterBusinessId !== targetBusinessId) {
        return next(new AppError('You do not have permission to delete this user', 403));
      }
    }

    await User.findByIdAndDelete(req.params['id']);

    res.status(204).json({
      status: 'success',
      data: null
    });
  }),

  updateMe: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { name, email, photo } = req.body;

    // Prevent password and role updates through this endpoint
    if (req.body.password || req.body.passwordConfirm || req.body.role) {
      return next(
        new AppError(
          'This route is not for password or role updates. Use /updateMyPassword for password updates.',
          400
        )
      );
    }

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(new AppError('Please provide a valid email', 400));
    }

    // Build update object with only allowed fields
    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (photo) updateData.photo = photo;

    // Update user document
    const updatedUser = await User.findByIdAndUpdate(
      req.user?._id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedUser) {
      return next(new AppError('User not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser
      }
    });
  }),

  deleteMe: catchAsync(async (req: IRequestWithUser, res: Response, _next: NextFunction) => {
    await User.findByIdAndUpdate(req.user?._id, { active: false });

    res.status(204).json({
      status: 'success',
      data: null
    });
  })
};

export default userController;
