import crypto from 'crypto';
import mongoose from 'mongoose';
import validator from 'validator';
import bcrypt from 'bcryptjs';
import { IUser } from '../types';
import {
  getPrimaryRole,
  getUserRoles,
  requiresBusinessAssignment,
  validateRoles,
  VALID_USER_ROLES
} from '../utils/userRoles';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please tell us your name!']
  },
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  photo: {
    type: String,
    default: 'default.jpg'
  },
  roles: {
    type: [String],
    enum: VALID_USER_ROLES
  },
  /** @deprecated Use `roles`. Kept for legacy documents; synced on save. */
  role: {
    type: String,
    enum: VALID_USER_ROLES
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    default: null,
    required: function (this: IUser) {
      return requiresBusinessAssignment(getUserRoles(this));
    }
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    select: false
  },
  passwordConfirm: {
    type: String,
    required: function (this: IUser) {
      return this.isNew || this.isModified('password');
    },
    validate: {
      validator: function (this: IUser, el: string): boolean {
        return el === this.password;
      },
      message: 'Passwords are not the same!'
    }
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  active: {
    type: Boolean,
    default: true,
    select: false
  },
  wallet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    default: null
  }
});

userSchema.pre('init', function () {
  const roles = getUserRoles(this);
  if (roles.length > 0) {
    this.roles = roles;
    (this as any).role = getPrimaryRole(this) ?? roles[0] ?? 'attendant';
  } else if (this.role) {
    this.roles = [this.role];
  }
});

userSchema.pre('save', function (next) {
  const roles = getUserRoles(this);
  const validationError = validateRoles(roles);
  if (validationError) {
    return next(new Error(validationError));
  }
  if (roles.length > 0) {
    this.roles = roles;
    (this as any).role = getPrimaryRole({ roles }) ?? roles[0] ?? 'attendant';
  }
  next();
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);
  (this as any).passwordConfirm = undefined;
  next();
});

userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = new Date(Date.now() - 1000);
  next();
});

userSchema.pre(/^find/, function (this: any, next) {
  if (this.getOptions().includeInactive) {
    return next();
  }
  this.find({ active: { $ne: false } });
  next();
});

userSchema.virtual('primaryRole').get(function (this: IUser) {
  return getPrimaryRole(this);
});

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

userSchema.methods['correctPassword'] = async function (
  candidatePassword: string,
  userPassword: string
): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods['changedPasswordAfter'] = function (this: IUser, JWTTimestamp: number): boolean {
  if (this.passwordChangedAt) {
    const changedTimestamp = Math.floor(this.passwordChangedAt.getTime() / 1000);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods['createPasswordResetToken'] = function (this: IUser): string {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);

  return resetToken;
};

const User = mongoose.model<IUser>('User', userSchema);

export default User;
