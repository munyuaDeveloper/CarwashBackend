import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import mongoose from 'mongoose';
import User from '../models/userModel';
import Business from '../models/businessModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import APIFeatures from '../utils/apiFeatures';
import { uploadImageBuffer } from '../utils/cloudinary';
import {
  getPrimaryRole,
  getUserRoles,
  normalizeRoles,
  requiresBusinessAssignment,
  canAssignRoles,
  userHasAnyRole,
  userHasRole,
  validateRoles,
  VALID_USER_ROLES
} from '../utils/userRoles';
import emailService from '../utils/email';
import { generateDefaultPassword } from '../utils/defaultPassword';

const isBusinessScopedManager = (user?: { roles?: unknown; role?: unknown } | null): boolean =>
  userHasAnyRole(user, ['business_admin', 'admin']);

const findUserByIdIncludingInactive = (userId: string) =>
  User.findById(userId).setOptions({ includeInactive: true }).select('+active');

const parseTargetRoles = (body: { role?: unknown; roles?: unknown }, fallbackUser?: { roles?: unknown; role?: unknown }) => {
  const fromBody = normalizeRoles(body.roles ?? body.role);
  if (fromBody.length > 0) return fromBody;
  return getUserRoles(fallbackUser);
};

const isRolePayload = (body: { role?: unknown; roles?: unknown }): boolean =>
  body.role !== undefined || body.roles !== undefined;

/** Match users by multi-role array or legacy single role field. */
const buildRoleMatchFilter = (role: string) => ({
  $or: [{ roles: role }, { role: role }]
});

const assertCanManageUser = (
  req: IRequestWithUser,
  targetUser: { _id: mongoose.Types.ObjectId | string; roles?: unknown; role?: unknown; business?: mongoose.Types.ObjectId | string | null },
  next: NextFunction,
  options?: { allowSelfNonRoleUpdate?: boolean }
): boolean => {
  const requesterId = req.user?._id?.toString();
  const targetId = targetUser._id.toString();
  const isSelf = Boolean(requesterId && requesterId === targetId);

  if (isSelf && !options?.allowSelfNonRoleUpdate) {
    next(new AppError('You cannot modify or deactivate your own account', 403));
    return false;
  }

  if (isBusinessScopedManager(req.user)) {
    if (userHasRole(targetUser, 'system_admin')) {
      next(new AppError('You do not have permission to manage this user', 403));
      return false;
    }

    const requesterBusinessId = req.user?.business ? req.user.business.toString() : null;
    const targetBusinessId = targetUser.business ? targetUser.business.toString() : null;
    if (!requesterBusinessId || requesterBusinessId !== targetBusinessId) {
      next(new AppError('You do not have permission to manage this user', 403));
      return false;
    }
  }

  return true;
};

const userController = {
  getMe: (req: IRequestWithUser, _res: Response, next: NextFunction) => {
    req.params['id'] = req.user?._id || '';
    next();
  },

  getUser: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const user = await findUserByIdIncludingInactive(req.params['id']!).populate('business', 'name');

    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    if (isBusinessScopedManager(req.user)) {
      if (userHasRole(user, 'system_admin')) {
        return next(new AppError('You do not have permission to view this user', 403));
      }
      const requesterBusinessId = req.user?.business ? req.user.business.toString() : null;
      const targetBusinessId = user.business ? user.business.toString() : null;
      if (!requesterBusinessId || requesterBusinessId !== targetBusinessId) {
        return next(new AppError('You do not have permission to view this user', 403));
      }
    }

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  }),

  getAllUsers: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { role, search, activeOnly } = req.query;
    const filter: any = {};
    const andClauses: any[] = [];
    const activeOnlyFilter = activeOnly === 'true';

    if (role) {
      if (!VALID_USER_ROLES.includes(role as any)) {
        return next(
          new AppError(
            'Role must be one of "attendant", "admin", "system_admin", or "business_admin"',
            400
          )
        );
      }
      andClauses.push(buildRoleMatchFilter(role as string));
    }

    if (typeof search === 'string' && search.trim().length > 0) {
      const safeSearch = search.trim();
      const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');

      const orFilters: Record<string, unknown>[] = [
        { name: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
        { roles: { $regex: searchRegex } },
        { role: { $regex: searchRegex } }
      ];

      if (mongoose.Types.ObjectId.isValid(safeSearch)) {
        orFilters.push({ _id: safeSearch });
        orFilters.push({ business: safeSearch });
      }

      const matchingBusinesses = await Business.find({ name: { $regex: searchRegex } }).select('_id');
      if (matchingBusinesses.length > 0) {
        orFilters.push({
          business: { $in: matchingBusinesses.map((business) => business._id) }
        });
      }

      andClauses.push({ $or: orFilters });
    }

    if (isBusinessScopedManager(req.user)) {
      const requesterBusinessId = req.user?.business ? req.user.business.toString() : null;
      if (!requesterBusinessId) {
        return next(new AppError('Business admin is missing business assignment', 403));
      }
      filter.business = requesterBusinessId;

      if (!role) {
        andClauses.push({
          $nor: [{ roles: 'system_admin' }, { role: 'system_admin' }]
        });
      } else if (role === 'system_admin') {
        res.status(200).json({
          status: 'success',
          results: 0,
          data: { users: [] }
        });
        return;
      }
    }

    if (andClauses.length > 0) {
      filter.$and = andClauses;
    }

    if (activeOnlyFilter) {
      filter.active = { $ne: false };
    }

    let userQuery = User.find(filter).populate('business', 'name');
    if (!activeOnlyFilter) {
      userQuery = userQuery.setOptions({ includeInactive: true });
    }
    userQuery = userQuery.select('+active');

    const features = new APIFeatures(userQuery, req.query)
      .sort()
      .limitFields();

    await features.paginate();
    features.totalCount = await User.countDocuments(features.query.getQuery()).setOptions({
      includeInactive: true
    });

    const users = await features.query;
    const normalizedUsers = users.map((user: (typeof users)[number]) => {
      const plain = user.toObject({ virtuals: true });
      const roles = getUserRoles(plain);
      return {
        ...plain,
        roles,
        role: getPrimaryRole({ roles }) ?? plain.role
      };
    });
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 100);

    res.status(200).json({
      status: 'success',
      results: normalizedUsers.length,
      total: features.totalCount ?? normalizedUsers.length,
      page,
      limit,
      data: { users: normalizedUsers }
    });
  }),

  createUser: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { name, email, password, passwordConfirm, role, roles, photo, business } = req.body;

    if (!canAssignRoles(req.user)) {
      return next(
        new AppError('Only business admins and system admins can create users and assign roles', 403)
      );
    }

    if (!name || !email) {
      return next(new AppError('Name and email are required', 400));
    }

    let plainPassword: string;
    const hasPassword = typeof password === 'string' && password.length > 0;
    const hasPasswordConfirm = typeof passwordConfirm === 'string' && passwordConfirm.length > 0;

    if (hasPassword || hasPasswordConfirm) {
      if (!hasPassword || !hasPasswordConfirm) {
        return next(new AppError('password and passwordConfirm are both required when setting a password', 400));
      }
      if (password !== passwordConfirm) {
        return next(new AppError('Passwords do not match', 400));
      }
      plainPassword = password;
    } else {
      plainPassword = generateDefaultPassword();
    }

    const targetRoles = parseTargetRoles({ role, roles });
    const rolesError = validateRoles(targetRoles);
    if (rolesError) {
      return next(new AppError(rolesError, 400));
    }

    const requesterBusinessId = req.user?.business ? req.user.business.toString() : null;

    if (isBusinessScopedManager(req.user)) {
      if (userHasRole({ roles: targetRoles }, 'system_admin')) {
        return next(new AppError('You cannot create system_admin users', 403));
      }
      if (!requesterBusinessId) {
        return next(new AppError('Business admin is missing business assignment', 403));
      }
    }

    const effectiveBusiness = isBusinessScopedManager(req.user)
      ? requesterBusinessId
      : userHasRole({ roles: targetRoles }, 'system_admin')
        ? null
        : business;

    if (requiresBusinessAssignment(targetRoles) && !effectiveBusiness) {
      return next(new AppError('business is required for non-system_admin users', 400));
    }

    let businessName: string | undefined;
    if (effectiveBusiness) {
      if (!effectiveBusiness.match(/^[0-9a-fA-F]{24}$/)) {
        return next(new AppError('Invalid business ID format', 400));
      }
      const businessExists = await Business.findById(effectiveBusiness);
      if (!businessExists) {
        return next(new AppError('Business not found', 404));
      }
      businessName = businessExists.name;
    }

    const newUser = await User.create({
      name,
      email,
      password: plainPassword,
      passwordConfirm: plainPassword,
      roles: targetRoles,
      role: getPrimaryRole({ roles: targetRoles }),
      photo: photo || 'default.jpg',
      business: effectiveBusiness
    });

    emailService
      .sendNewUserCredentialsEmail(
        { name: newUser.name, email: newUser.email },
        plainPassword,
        {
          roles: targetRoles,
          ...(businessName ? { businessName } : {})
        }
      )
      .catch((err) => {
        console.error('Failed to send new user credentials email:', err);
      });

    res.status(201).json({
      status: 'success',
      data: {
        user: {
          _id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          roles: getUserRoles(newUser),
          role: getPrimaryRole(newUser),
          photo: newUser.photo,
          active: newUser.active
        }
      }
    });
  }),

  updateUser: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { name, email, role, roles, photo, business, active } = req.body;

    if (active !== undefined && typeof active !== 'boolean') {
      return next(new AppError('active must be a boolean', 400));
    }

    const existingUser = await findUserByIdIncludingInactive(req.params['id']!);
    if (!existingUser) {
      return next(new AppError('No user found with that ID', 404));
    }

    const roleChangeRequested = isRolePayload({ role, roles });

    if (roleChangeRequested && !canAssignRoles(req.user)) {
      return next(
        new AppError('Only business admins and system admins can assign or change roles', 403)
      );
    }

    if (!assertCanManageUser(req, existingUser, next, { allowSelfNonRoleUpdate: true })) {
      return;
    }

    const targetRoles = roleChangeRequested
      ? parseTargetRoles({ role, roles })
      : getUserRoles(existingUser);

    const rolesError = validateRoles(targetRoles);
    if (rolesError) {
      return next(new AppError(rolesError, 400));
    }

    if (isBusinessScopedManager(req.user) && userHasRole({ roles: targetRoles }, 'system_admin')) {
      return next(new AppError('You cannot assign the system_admin role', 403));
    }

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

    const targetBusiness = business !== undefined ? business : existingUser.business;

    if (requiresBusinessAssignment(targetRoles) && !targetBusiness) {
      return next(new AppError('business is required for non-system_admin users', 400));
    }

    const user = await User.findByIdAndUpdate(
      req.params['id'],
      {
        ...(name && { name }),
        ...(email && { email }),
        ...(roleChangeRequested
          ? {
              roles: targetRoles,
              role: getPrimaryRole({ roles: targetRoles })
            }
          : {}),
        ...(photo && { photo }),
        ...(active !== undefined && { active }),
        ...(userHasRole({ roles: targetRoles }, 'system_admin') && { business: null }),
        ...(business !== undefined && {
          business: userHasRole({ roles: targetRoles }, 'system_admin') ? null : business
        })
      },
      {
        new: true,
        runValidators: true,
        includeInactive: true
      }
    ).select('+active');

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  }),

  deleteUser: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const user = await findUserByIdIncludingInactive(req.params['id']!);

    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    if (!assertCanManageUser(req, user, next)) {
      return;
    }

    if (user.active === false) {
      return next(new AppError('User is already deactivated', 400));
    }

    await User.findByIdAndUpdate(req.params['id'], { active: false }, { includeInactive: true });

    res.status(200).json({
      status: 'success',
      message: 'User deactivated successfully',
      data: null
    });
  }),

  updateMe: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const { name, email, photo } = req.body;

    if (req.body.password || req.body.passwordConfirm || req.body.role || req.body.roles) {
      return next(
        new AppError(
          'This route is not for password or role updates. Use /updateMyPassword for password updates.',
          400
        )
      );
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(new AppError('Please provide a valid email', 400));
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (photo) updateData.photo = photo;

    const uploadedPhoto = (req as IRequestWithUser & { file?: Express.Multer.File }).file;
    if (uploadedPhoto?.buffer) {
      const uploadResult = await uploadImageBuffer(uploadedPhoto.buffer, 'carwash/users');
      updateData.photo = uploadResult.secureUrl;
    }

    const updatedUser = await User.findByIdAndUpdate(req.user?._id, updateData, {
      new: true,
      runValidators: true
    });

    if (!updatedUser) {
      return next(new AppError('User not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: { user: updatedUser }
    });
  }),

  deleteMe: catchAsync(async (_req: IRequestWithUser, _res: Response, next: NextFunction) => {
    return next(
      new AppError(
        'You cannot deactivate your own account. Please contact another administrator.',
        403
      )
    );
  })
};

export default userController;
