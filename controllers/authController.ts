import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import User from '../models/userModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import { createSendToken, verifyToken } from '../utils/jwt';
import crypto from 'crypto';
import emailService from '../utils/email';

const authController = {
  signup: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { name, email, password, passwordConfirm, role } = req.body;

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
      role: role || 'attendant'
    });

    // Send welcome email (non-blocking)
    emailService.sendWelcomeEmail(newUser).catch(err => {
      console.error('Failed to send welcome email:', err);
    });

    createSendToken(newUser, 201, res);
  }),

  login: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    // 1) Check if email and password exist
    if (!email || !password) {
      return next(new AppError('Please provide email and password!', 400));
    }

    // 2) Check if user exists && password is correct
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.correctPassword(password, user.password))) {
      return next(new AppError('Incorrect email or password', 401));
    }

    // 3) If everything ok, send token to client
    createSendToken(user, 200, res);
  }),

  logout: (_req: IRequestWithUser, res: Response, _next: NextFunction) => {
    res.cookie('jwt', 'loggedout', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true
    });
    res.status(200).json({ status: 'success' });
  },

  forgotPassword: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    // 1) Get user based on POSTed email
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return next(new AppError('There is no user with email address.', 404));
    }

    // 2) Generate the random reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // 3) Send it to user's email
    try {
      const resetURL = `${req.protocol}://${req.get('host')}/api/v1/users/resetPassword/${resetToken}`;

      // Send password reset email
      await emailService.sendPasswordResetEmail(user, resetURL);

      res.status(200).json({
        status: 'success',
        message: 'Token sent to email!'
      });
    } catch (err) {
      user.passwordResetToken = undefined as any;
      user.passwordResetExpires = undefined as any;
      await user.save({ validateBeforeSave: false });

      return next(
        new AppError('There was an error sending the email. Try again later.', 500)
      );
    }
  }),

  resetPassword: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    // 1) Get user based on the token
    const token = req.params['token'];
    if (!token) {
      return next(new AppError('Token is missing', 400));
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    // 2) If token has not expired, and there is user, set the new password
    if (!user) {
      return next(new AppError('Token is invalid or has expired', 400));
    }
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    user.passwordResetToken = undefined as any;
    user.passwordResetExpires = undefined as any;
    await user.save();

    // 3) Update changedPasswordAt property for the user
    // 4) Log the user in, send JWT
    createSendToken(user, 200, res);
  }),

  updatePassword: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    // 1) Get user from collection
    const user = await User.findById(req.user?._id).select('+password');

    // 2) Check if POSTed current password is correct
    if (!(await user?.correctPassword(req.body.passwordCurrent, user.password))) {
      return next(new AppError('Your current password is wrong.', 401));
    }

    // 3) If so, update password
    user!.password = req.body.password;
    user!.passwordConfirm = req.body.passwordConfirm;
    await user!.save();
    // User.findByIdAndUpdate will NOT work as intended!

    // 4) Log user in, send JWT
    createSendToken(user!, 200, res);
  }),

  protect: catchAsync(async (req: IRequestWithUser, _res: Response, next: NextFunction) => {
    // 1) Getting token and check of it's there
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies['jwt']) {
      token = req.cookies['jwt'];
    }

    if (!token) {
      return next(
        new AppError('You are not logged in! Please log in to get access.', 401)
      );
    }

    // 2) Verification token
    const decoded = verifyToken(token);

    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return next(
        new AppError(
          'The user belonging to this token does no longer exist.',
          401
        )
      );
    }

    // 4) Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return next(
        new AppError('User recently changed password! Please log in again.', 401)
      );
    }

    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser;
    next();
  }),

  restrictTo: (...roles: string[]) => {
    return (req: IRequestWithUser, _res: Response, next: NextFunction) => {
      // roles ['admin', 'lead-guide']. role='user'
      if (!roles.includes(req.user?.role || '')) {
        return next(
          new AppError('You do not have permission to perform this action', 403)
        );
      }

      next();
    };
  }
};

export default authController;
