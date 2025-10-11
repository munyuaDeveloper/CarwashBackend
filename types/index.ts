import { Request, Response, NextFunction } from 'express';
import { Document } from 'mongoose';

// User related types
export interface IUser extends Document {
  _id: string;
  name: string;
  email: string;
  password: string;
  passwordConfirm?: string;
  role: 'attendant' | 'admin';
  photo: string;
  passwordChangedAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  active: boolean;
  correctPassword(candidatePassword: string, userPassword: string): Promise<boolean>;
  changedPasswordAfter(JWTTimestamp: number): boolean;
  createPasswordResetToken(): string;
}

// Request with user
export interface IRequestWithUser extends Request {
  user?: IUser;
}

// JWT Payload
export interface IJWTPayload {
  id: string;
  iat: number;
  exp: number;
}

// API Response
export interface IApiResponse<T = any> {
  status: 'success' | 'error';
  statusCode: number;
  message?: string;
  data?: T;
  results?: number;
}

// Error types
export interface IAppError extends Error {
  statusCode: number;
  status: string;
  isOperational: boolean;
}

// Global error handler
export type GlobalErrorHandler = (
  err: IAppError,
  req: Request,
  res: Response,
  next: NextFunction
) => void;

// Async function type
export type AsyncFunction = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

// Controller function type
export type ControllerFunction = (
  req: IRequestWithUser,
  res: Response,
  next: NextFunction
) => Promise<void>;

// Booking related types
export interface IBooking extends Document {
  _id: string;
  carRegistrationNumber: string;
  attendant: string; // ObjectId reference to User
  amount: number;
  serviceType: 'full wash' | 'half wash';
  vehicleType: string;
  paymentType: 'cash' | 'till number' | 'attendant collected';
  status: 'pending' | 'in progress' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

// Environment variables
export interface IEnvConfig {
  NODE_ENV: string;
  PORT: number;
  DATABASE: string;
  DATABASE_PASSWORD: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_COOKIE_EXPIRES_IN: number;
  EMAIL_FROM: string;
  EMAIL_USERNAME: string;
  EMAIL_PASSWORD: string;
  EMAIL_HOST: string;
  EMAIL_PORT: number;
  EMAIL_SECURE: boolean;
}
