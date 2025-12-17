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
  wallet?: string; // ObjectId reference to Wallet
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
  carRegistrationNumber?: string;
  phoneNumber?: string;
  color?: string;
  attendant: string; // ObjectId reference to User
  amount: number;
  serviceType?: 'full wash' | 'half wash';
  vehicleType?: string;
  category: 'vehicle' | 'carpet';
  paymentType: 'attendant_cash' | 'admin_cash' | 'admin_till';
  status: 'pending' | 'in progress' | 'completed' | 'cancelled';
  attendantPaid: boolean;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Wallet related types
export interface IWallet extends Document {
  _id: string;
  attendant: string; // ObjectId reference to User
  balance: number;
  totalEarnings: number;
  totalCommission: number;
  totalCompanyShare: number;
  companyDebt: number; // How much attendant owes company
  lastPaymentDate: Date | null;
  isPaid: boolean;
  createdAt: Date;
  updatedAt: Date;
  resetWallet(): Promise<IWallet>;
  calculateBalanceFromBookings(targetDate?: Date): Promise<IWallet>;
}

// Wallet model static methods
export interface IWalletModel {
  getOrCreateWallet(attendantId: string): Promise<IWallet>;
  find(query?: any): any;
  countDocuments(query?: any): Promise<number>;
  aggregate(pipeline: any[]): Promise<any[]>;
}


// System wallet types
export interface ISystemWallet extends Document {
  _id: string;
  totalRevenue: number;
  totalCompanyShare: number;
  totalAttendantPayments: number;
  totalAdminCollections: number;
  totalAttendantCollections: number;
  currentBalance: number;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
  creditSystemWallet(amount: number, source: string): Promise<ISystemWallet>;
  trackCompanyShare(amount: number): Promise<ISystemWallet>;
  reverseSystemWalletTransaction(amount: number, source: string): Promise<ISystemWallet>;
}

// System wallet model static methods
export interface ISystemWalletModel {
  getOrCreateSystemWallet(): Promise<ISystemWallet>;
  find(query?: any): any;
  aggregate(pipeline: any[]): Promise<any[]>;
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
