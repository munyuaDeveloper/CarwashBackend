import { Request, Response } from 'express';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import MpesaTransaction from '../models/mpesaTransactionModel';
import { completeBookingAfterMpesaPayment } from '../utils/bookingPaymentCompletion';

type CallbackMetadataItem = {
  Name?: string;
  Value?: string | number;
};

type StkCallbackBody = {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: CallbackMetadataItem[];
      };
    };
  };
};

const verifyCallbackSecret = (req: Request): void => {
  const expected = process.env['MPESA_CALLBACK_SECRET']?.trim();
  if (!expected) return;

  const headerSecret = req.get('x-mpesa-callback-secret');
  const querySecret = typeof req.query['secret'] === 'string' ? req.query['secret'] : undefined;

  if (headerSecret !== expected && querySecret !== expected) {
    throw new AppError('Invalid M-PESA callback secret', 401);
  }
};

const readMetadataValue = (
  items: CallbackMetadataItem[] | undefined,
  name: string
): string | number | undefined => {
  if (!items?.length) return undefined;
  const match = items.find((item) => item.Name === name);
  return match?.Value;
};

const mapResultCodeToStatus = (resultCode: number): 'success' | 'failed' | 'cancelled' | 'timeout' => {
  if (resultCode === 0) return 'success';
  if (resultCode === 1032) return 'cancelled';
  if (resultCode === 1037) return 'timeout';
  return 'failed';
};

const mpesaCallbackController = {
  handleStkCallback: catchAsync(async (req: Request, res: Response) => {
    verifyCallbackSecret(req);

    if (process.env['NODE_ENV'] === 'development') {
      console.log('[M-PESA callback]', {
        contentType: req.get('content-type'),
        body: req.body
      });
    }

    const payload = req.body as StkCallbackBody;
    const stkCallback = payload.Body?.stkCallback;

    if (!stkCallback?.CheckoutRequestID) {
      res.status(200).json({
        status: 'success',
        message: 'Callback received with no checkout request ID',
        processed: false
      });
      return;
    }

    const transaction = await MpesaTransaction.findOne({
      checkoutRequestId: stkCallback.CheckoutRequestID
    });

    if (!transaction) {
      res.status(200).json({
        status: 'success',
        message: 'Callback received for unknown transaction',
        processed: false
      });
      return;
    }

    if (transaction.status === 'success') {
      res.status(200).json({
        status: 'success',
        message: 'Transaction already processed',
        processed: true
      });
      return;
    }

    const resultCode = stkCallback.ResultCode ?? -1;
    const metadata = stkCallback.CallbackMetadata?.Item;
    const mpesaReceiptNumber = readMetadataValue(metadata, 'MpesaReceiptNumber');

    if (stkCallback.MerchantRequestID) {
      transaction.merchantRequestId = stkCallback.MerchantRequestID;
    }
    transaction.resultCode = resultCode;
    if (stkCallback.ResultDesc) {
      transaction.resultDesc = stkCallback.ResultDesc;
    }
    transaction.status = mapResultCodeToStatus(resultCode);
    transaction.rawCallback = req.body;
    transaction.completedAt = new Date();

    if (typeof mpesaReceiptNumber === 'string' || typeof mpesaReceiptNumber === 'number') {
      transaction.mpesaReceiptNumber = String(mpesaReceiptNumber);
    }

    await transaction.save();

    if (resultCode === 0 && transaction.booking) {
      try {
        await completeBookingAfterMpesaPayment(transaction.booking.toString());
      } catch (error) {
        console.error('Failed to complete booking after M-PESA callback:', error);
      }
    }

    res.status(200).json({
      status: 'success',
      processed: true,
      transactionId: transaction._id
    });
  }),

  health: catchAsync(async (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'mpesa-webhook',
      timestamp: new Date().toISOString()
    });
  })
};

export default mpesaCallbackController;
