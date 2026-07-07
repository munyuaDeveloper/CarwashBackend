import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { IRequestWithUser } from '../types';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import Business from '../models/businessModel';
import Booking from '../models/bookingModel';
import MpesaTransaction from '../models/mpesaTransactionModel';
import { userHasAnyRole } from '../utils/userRoles';
import { normalizeKenyanMobile } from '../utils/textSmsService';
import {
  buildAccountReference,
  initiateStkPush,
  queryStkPushStatus,
  resolveMpesaCallbackUrl,
  verifyMpesaOAuth
} from '../utils/mpesaService';
import {
  buildMpesaSettingsUpdate,
  resolveBusinessMpesaCredentials,
  resolveBusinessMpesaOAuthCredentials,
  toPublicMpesaSettings,
  type MpesaSettingsInput,
  type StoredMpesaSettings
} from '../utils/mpesaCredentials';
import { completeBookingAfterMpesaPayment } from '../utils/bookingPaymentCompletion';

const getBusinessContext = (req: IRequestWithUser): string | null =>
  userHasAnyRole(req.user, ['system_admin', 'admin'])
    ? typeof req.params['businessId'] === 'string'
      ? req.params['businessId']
      : typeof req.query['businessId'] === 'string'
        ? req.query['businessId']
        : null
    : req.user?.business
      ? req.user.business.toString()
      : null;

const assertBusinessAccess = (
  req: IRequestWithUser,
  businessId: string,
  next: NextFunction
): boolean => {
  if (userHasAnyRole(req.user, ['system_admin', 'admin'])) {
    return true;
  }

  const userBusinessId = req.user?.business ? req.user.business.toString() : null;
  if (!userBusinessId || userBusinessId !== businessId) {
    next(new AppError('You do not have permission to access this business', 403));
    return false;
  }

  return true;
};

const parseMpesaSettingsInput = (body: Record<string, unknown>): MpesaSettingsInput => {
  const input: MpesaSettingsInput = {};

  if (body['enabled'] !== undefined) {
    if (typeof body['enabled'] !== 'boolean') {
      throw new AppError('enabled must be a boolean', 400);
    }
    input.enabled = body['enabled'];
  }

  if (body['environment'] !== undefined) {
    if (body['environment'] !== 'sandbox' && body['environment'] !== 'production') {
      throw new AppError('environment must be "sandbox" or "production"', 400);
    }
    input.environment = body['environment'];
  }

  if (body['shortcodeType'] !== undefined) {
    if (body['shortcodeType'] !== 'paybill' && body['shortcodeType'] !== 'till') {
      throw new AppError('shortcodeType must be "paybill" or "till"', 400);
    }
    input.shortcodeType = body['shortcodeType'];
  }

  if (body['businessShortCode'] !== undefined) {
    if (typeof body['businessShortCode'] !== 'string' || !body['businessShortCode'].trim()) {
      throw new AppError('businessShortCode must be a non-empty string', 400);
    }
    input.businessShortCode = body['businessShortCode'];
  }

  if (body['passkey'] !== undefined) {
    if (typeof body['passkey'] !== 'string' || !body['passkey'].trim()) {
      throw new AppError('passkey must be a non-empty string', 400);
    }
    input.passkey = body['passkey'];
  }

  if (body['consumerKey'] !== undefined) {
    if (typeof body['consumerKey'] !== 'string' || !body['consumerKey'].trim()) {
      throw new AppError('consumerKey must be a non-empty string', 400);
    }
    input.consumerKey = body['consumerKey'];
  }

  if (body['consumerSecret'] !== undefined) {
    if (typeof body['consumerSecret'] !== 'string' || !body['consumerSecret'].trim()) {
      throw new AppError('consumerSecret must be a non-empty string', 400);
    }
    input.consumerSecret = body['consumerSecret'];
  }

  if (body['accountReferencePrefix'] !== undefined) {
    if (typeof body['accountReferencePrefix'] !== 'string') {
      throw new AppError('accountReferencePrefix must be a string', 400);
    }
    input.accountReferencePrefix = body['accountReferencePrefix'];
  }

  return input;
};

const mapTransactionForResponse = (transaction: Record<string, unknown>) => {
  const booking = transaction['booking'];
  const initiatedBy = transaction['initiatedBy'];
  const business = transaction['business'];

  const bookingSummary =
    booking && typeof booking === 'object' && booking !== null && '_id' in booking
      ? {
          _id: (booking as { _id: unknown })._id,
          carRegistrationNumber: (booking as { carRegistrationNumber?: string }).carRegistrationNumber,
          amount: (booking as { amount?: number }).amount,
          status: (booking as { status?: string }).status,
          paymentType: (booking as { paymentType?: string }).paymentType
        }
      : booking ?? null;

  const businessSummary =
    business && typeof business === 'object' && business !== null && '_id' in business
      ? {
          _id: (business as { _id: unknown })._id,
          name: (business as { name?: string }).name
        }
      : business ?? null;

  const initiatedBySummary =
    initiatedBy && typeof initiatedBy === 'object' && initiatedBy !== null && '_id' in initiatedBy
      ? {
          _id: (initiatedBy as { _id: unknown })._id,
          name: (initiatedBy as { name?: string }).name,
          email: (initiatedBy as { email?: string }).email
        }
      : initiatedBy ?? null;

  return {
    _id: transaction['_id'],
    business: businessSummary,
    booking: bookingSummary,
    amount: transaction['amount'],
    phoneNumber: transaction['phoneNumber'],
    accountReference: transaction['accountReference'],
    transactionDesc: transaction['transactionDesc'],
    merchantRequestId: transaction['merchantRequestId'],
    checkoutRequestId: transaction['checkoutRequestId'],
    status: transaction['status'],
    resultCode: transaction['resultCode'],
    resultDesc: transaction['resultDesc'],
    mpesaReceiptNumber: transaction['mpesaReceiptNumber'],
    initiatedBy: initiatedBySummary,
    responseCode: transaction['responseCode'],
    responseDescription: transaction['responseDescription'],
    customerMessage: transaction['customerMessage'],
    completedAt: transaction['completedAt'],
    createdAt: transaction['createdAt'],
    updatedAt: transaction['updatedAt']
  };
};

const mpesaController = {
  getMpesaConfig: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = getBusinessContext(req);
    if (!businessId) {
      return next(new AppError('Business context is required', 400));
    }
    if (!assertBusinessAccess(req, businessId, next)) return;

    const business = await Business.findById(businessId).select('name mpesaSettings');
    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        businessId,
        businessName: business['name'],
        mpesaSettings: toPublicMpesaSettings(business['mpesaSettings'] as StoredMpesaSettings)
      }
    });
  }),

  updateMpesaConfig: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = getBusinessContext(req);
    if (!businessId) {
      return next(new AppError('Business context is required', 400));
    }

    const business = await Business.findById(businessId).select('mpesaSettings');
    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    let input: MpesaSettingsInput;
    try {
      input = parseMpesaSettingsInput(req.body as Record<string, unknown>);
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      return next(new AppError('Invalid M-PESA settings payload', 400));
    }

    let update: Record<string, unknown>;
    try {
      update = buildMpesaSettingsUpdate(
        business['mpesaSettings'] as StoredMpesaSettings | undefined,
        input
      );
    } catch (error) {
      return next(
        new AppError(error instanceof Error ? error.message : 'Invalid M-PESA settings', 400)
      );
    }

    if (Object.keys(update).length === 0) {
      return next(new AppError('No M-PESA settings were provided to update', 400));
    }

    const updatedBusiness = await Business.findByIdAndUpdate(businessId, update, {
      new: true,
      runValidators: true
    }).select('name mpesaSettings');

    res.status(200).json({
      status: 'success',
      data: {
        businessId,
        businessName: updatedBusiness?.['name'],
        mpesaSettings: toPublicMpesaSettings(updatedBusiness?.['mpesaSettings'] as StoredMpesaSettings)
      }
    });
  }),

  verifyMpesaConfig: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = getBusinessContext(req);
    if (!businessId) {
      return next(new AppError('Business context is required', 400));
    }

    const business = await Business.findById(businessId).select('mpesaSettings');
    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    let input: MpesaSettingsInput = {};
    try {
      const body = req.body as Record<string, unknown>;
      if (Object.keys(body).length > 0) {
        input = parseMpesaSettingsInput(body);
      }
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      return next(new AppError('Invalid M-PESA settings payload', 400));
    }

    let oauthCredentials;
    try {
      oauthCredentials = resolveBusinessMpesaOAuthCredentials(
        business['mpesaSettings'] as StoredMpesaSettings | undefined,
        input
      );
    } catch (error) {
      return next(
        new AppError(error instanceof Error ? error.message : 'M-PESA credentials are incomplete', 400)
      );
    }

    const oauth = await verifyMpesaOAuth(oauthCredentials);

    const storedSettings = business['mpesaSettings'] as StoredMpesaSettings | undefined;

    res.status(200).json({
      status: 'success',
      data: {
        businessId,
        oauthVerified: true,
        environment: oauthCredentials.environment,
        shortcode: (input.businessShortCode ?? storedSettings?.businessShortCode ?? '').trim(),
        tokenExpiresInSeconds: oauth.expiresInSeconds,
        message:
          'Consumer key and secret are valid. Save settings after re-entering passkey and consumer secret if STK push still fails.'
      }
    });
  }),

  initiateStkPush: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('User not authenticated', 401));
    }

    const { bookingId, phoneNumber, amount, transactionDesc } = req.body as {
      bookingId?: string;
      phoneNumber?: string;
      amount?: number;
      transactionDesc?: string;
    };

    if (!bookingId || typeof bookingId !== 'string') {
      return next(new AppError('bookingId is required', 400));
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }

    const businessId = booking.business.toString();
    if (!assertBusinessAccess(req, businessId, next)) return;

    if (booking.status === 'cancelled') {
      return next(new AppError('Cannot collect payment for a cancelled booking', 400));
    }

    const business = await Business.findById(businessId).select('name mpesaSettings');
    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    let credentials;
    try {
      credentials = resolveBusinessMpesaCredentials(business['mpesaSettings'] as StoredMpesaSettings);
    } catch (error) {
      return next(
        new AppError(error instanceof Error ? error.message : 'M-PESA is not configured', 400)
      );
    }

    const resolvedPhone =
      (typeof phoneNumber === 'string' && phoneNumber.trim()) ||
      booking.customerPhoneNumber ||
      booking.phoneNumber ||
      '';

    const normalizedPhone = normalizeKenyanMobile(resolvedPhone);
    if (!normalizedPhone) {
      return next(
        new AppError(
          'A valid Kenyan phone number is required. Provide phoneNumber or ensure the booking has a customer phone.',
          400
        )
      );
    }

    const resolvedAmount = amount !== undefined ? Math.round(amount) : Math.round(booking.amount);
    if (!Number.isFinite(resolvedAmount) || resolvedAmount < 1) {
      return next(new AppError('Amount must be a positive whole number', 400));
    }

    const recentPending = await MpesaTransaction.findOne({
      booking: booking._id,
      status: 'pending',
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) }
    });

    if (recentPending) {
      return next(
        new AppError(
          'An STK Push is already pending for this booking. Wait for the customer response or query the existing transaction.',
          409
        )
      );
    }

    const accountReference = buildAccountReference(
      credentials.accountReferencePrefix || 'WF',
      booking._id.toString()
    );
    const description =
      (typeof transactionDesc === 'string' && transactionDesc.trim()) ||
      (booking.carRegistrationNumber
        ? `Wash ${booking.carRegistrationNumber}`
        : 'Carwash payment');

    const transaction = await MpesaTransaction.create({
      business: business._id,
      booking: booking._id,
      amount: resolvedAmount,
      phoneNumber: normalizedPhone,
      accountReference,
      transactionDesc: description.slice(0, 13),
      status: 'pending',
      initiatedBy: req.user._id
    });

    try {
      const callbackUrl = resolveMpesaCallbackUrl();
      const stkResult = await initiateStkPush(credentials, {
        phoneNumber: normalizedPhone,
        amount: resolvedAmount,
        accountReference,
        transactionDesc: description,
        callbackUrl
      });

      transaction.merchantRequestId = stkResult.merchantRequestId;
      transaction.checkoutRequestId = stkResult.checkoutRequestId;
      transaction.responseCode = stkResult.responseCode;
      transaction.responseDescription = stkResult.responseDescription;
      transaction.customerMessage = stkResult.customerMessage;
      transaction.rawInitResponse = stkResult.rawResponse;
      await transaction.save();

      res.status(201).json({
        status: 'success',
        data: {
          transaction: mapTransactionForResponse(transaction.toObject()),
          customerMessage: stkResult.customerMessage
        }
      });
    } catch (error) {
      transaction.status = 'failed';
      transaction.resultDesc = error instanceof Error ? error.message : 'STK Push initiation failed';
      transaction.completedAt = new Date();
      await transaction.save();

      return next(
        new AppError(
          error instanceof Error ? error.message : 'Failed to initiate STK Push',
          502
        )
      );
    }
  }),

  getTransaction: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const transaction = await MpesaTransaction.findById(req.params['id']).populate(
      'initiatedBy',
      'name email'
    );

    if (!transaction) {
      return next(new AppError('M-PESA transaction not found', 404));
    }

    if (!assertBusinessAccess(req, transaction.business.toString(), next)) return;

    res.status(200).json({
      status: 'success',
      data: {
        transaction: mapTransactionForResponse(transaction.toObject())
      }
    });
  }),

  getBookingPaymentStatus: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const booking = await Booking.findById(req.params['bookingId']);
    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }

    if (!assertBusinessAccess(req, booking.business.toString(), next)) return;

    const transactions = await MpesaTransaction.find({ booking: booking._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('initiatedBy', 'name email');

    const latest = transactions[0] ?? null;

    res.status(200).json({
      status: 'success',
      data: {
        bookingId: booking._id,
        bookingStatus: booking.status,
        latestTransaction: latest ? mapTransactionForResponse(latest.toObject()) : null,
        transactions: transactions.map((item) => mapTransactionForResponse(item.toObject()))
      }
    });
  }),

  queryTransaction: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const transaction = await MpesaTransaction.findById(req.params['id']);
    if (!transaction) {
      return next(new AppError('M-PESA transaction not found', 404));
    }

    if (!assertBusinessAccess(req, transaction.business.toString(), next)) return;

    if (!transaction.checkoutRequestId) {
      return next(new AppError('Transaction has no checkout request ID to query', 400));
    }

    if (transaction.status === 'success') {
      res.status(200).json({
        status: 'success',
        data: {
          transaction: mapTransactionForResponse(transaction.toObject()),
          queried: false,
          message: 'Transaction already marked successful'
        }
      });
      return;
    }

    const business = await Business.findById(transaction.business).select('mpesaSettings');
    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    let credentials;
    try {
      credentials = resolveBusinessMpesaCredentials(business['mpesaSettings'] as StoredMpesaSettings);
    } catch (error) {
      return next(
        new AppError(error instanceof Error ? error.message : 'M-PESA is not configured', 400)
      );
    }

    const queryResult = await queryStkPushStatus(credentials, transaction.checkoutRequestId);

    if (queryResult.resultCode === '0') {
      transaction.status = 'success';
      transaction.resultCode = 0;
      transaction.resultDesc = queryResult.resultDesc || 'Success';
      transaction.completedAt = new Date();
      await transaction.save();

      if (transaction.booking) {
        await completeBookingAfterMpesaPayment(transaction.booking.toString());
      }
    } else if (queryResult.resultCode && queryResult.resultCode !== '0') {
      const resultCode = Number(queryResult.resultCode);
      const terminalCodes = new Set([1032, 1037, 2001, 1]);
      if (terminalCodes.has(resultCode) && transaction.status === 'pending') {
        transaction.status = resultCode === 1032 ? 'cancelled' : 'failed';
        transaction.resultCode = resultCode;
        transaction.resultDesc = queryResult.resultDesc || 'Failed';
        transaction.completedAt = new Date();
        await transaction.save();
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        transaction: mapTransactionForResponse(transaction.toObject()),
        query: queryResult,
        queried: true
      }
    });
  }),

  listTransactions: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = getBusinessContext(req);
    const baseFilter: Record<string, unknown> = {};

    if (businessId) {
      baseFilter['business'] = businessId;
    }
    if (!userHasAnyRole(req.user, ['system_admin', 'admin']) && !businessId) {
      return next(new AppError('Business context is required', 400));
    }

    if (typeof req.query['bookingId'] === 'string' && req.query['bookingId'].trim()) {
      if (!mongoose.Types.ObjectId.isValid(req.query['bookingId'])) {
        return next(new AppError('Invalid bookingId', 400));
      }
      baseFilter['booking'] = req.query['bookingId'];
    }

    const statusRaw = typeof req.query['status'] === 'string' ? req.query['status'].trim() : '';
    const allowedStatuses = new Set(['pending', 'success', 'failed', 'cancelled', 'timeout']);
    if (statusRaw && statusRaw !== 'all' && allowedStatuses.has(statusRaw)) {
      baseFilter['status'] = statusRaw;
    }

    const searchRaw = typeof req.query['search'] === 'string' ? req.query['search'].trim() : '';
    if (searchRaw) {
      const escaped = searchRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      baseFilter['$or'] = [
        { phoneNumber: { $regex: searchRegex } },
        { mpesaReceiptNumber: { $regex: searchRegex } },
        { accountReference: { $regex: searchRegex } },
        { checkoutRequestId: { $regex: searchRegex } },
        { resultDesc: { $regex: searchRegex } }
      ];
    }

    const page = Math.max(1, Number(req.query['page'] ?? 1) || 1);
    const limit = Math.min(Math.max(1, Number(req.query['limit'] ?? 20) || 20), 100);
    const skip = (page - 1) * limit;

    const total = await MpesaTransaction.countDocuments(baseFilter);
    const transactions = await MpesaTransaction.find(baseFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('initiatedBy', 'name email')
      .populate('business', 'name')
      .populate('booking', 'carRegistrationNumber amount status paymentType');

    res.status(200).json({
      status: 'success',
      results: transactions.length,
      total,
      page,
      limit,
      data: {
        transactions: transactions.map((item) => mapTransactionForResponse(item.toObject()))
      }
    });
  })
};

export default mpesaController;
