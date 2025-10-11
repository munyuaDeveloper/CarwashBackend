import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import User from '../models/userModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';

// Placeholder TypeScript controller - convert from JS as needed
const userController = {
  getMe: (req: IRequestWithUser, _res: Response, next: NextFunction) => {
    // Implementation from JS file
    req.params['id'] = req.user?._id || '';
    next();
  },

  getUser: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const user = await User.findById(req.params['id']);

    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        user
      }
    });
  }),

  getAllUsers: catchAsync(async (_req: IRequestWithUser, res: Response, _next: NextFunction) => {
    const users = await User.find();

    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users
      }
    });
  }),

  createUser: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { name, email, password, passwordConfirm, role, photo } = req.body;

    // Validate required fields
    if (!name || !email || !password || !passwordConfirm) {
      return next(new AppError('Name, email, password, and passwordConfirm are required', 400));
    }

    // Validate password confirmation
    if (password !== passwordConfirm) {
      return next(new AppError('Passwords do not match', 400));
    }

    // Validate role if provided
    if (role && !['attendant', 'admin'].includes(role)) {
      return next(new AppError('Role must be either "attendant" or "admin"', 400));
    }

    // Create new user
    const newUser = await User.create({
      name,
      email,
      password,
      passwordConfirm,
      role: role || 'attendant',
      photo: photo || 'default.jpg'
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
    const { name, email, role, photo } = req.body;

    // Validate role if provided
    if (role && !['attendant', 'admin'].includes(role)) {
      return next(new AppError('Role must be either "attendant" or "admin"', 400));
    }

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(new AppError('Please provide a valid email', 400));
    }

    const user = await User.findByIdAndUpdate(
      req.params['id'],
      {
        ...(name && { name }),
        ...(email && { email }),
        ...(role && { role }),
        ...(photo && { photo })
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        user
      }
    });
  }),

  deleteUser: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const user = await User.findByIdAndDelete(req.params['id']);

    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null
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
