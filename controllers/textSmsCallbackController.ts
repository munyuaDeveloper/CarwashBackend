import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import Business from '../models/businessModel';
import SmsLog from '../models/smsLogModel';
import SmsDeliveryCallback from '../models/smsDeliveryCallbackModel';
import { normalizeKenyanMobile } from '../utils/textSmsService';
import {
  parseTextSmsCallbackPayload,
  ParsedTextSmsCallback,
  TextSmsDeliveryStatus
} from '../utils/textSmsCallbackParser';

type BusinessSnapshot = {
  businessId: mongoose.Types.ObjectId;
  name: string;
  managerName?: string;
  contactPhone?: string;
  contactEmail?: string;
  location?: string;
  slug?: string;
};

const verifyCallbackSecret = (req: Request): void => {
  const expected = process.env['TEXTSMS_CALLBACK_SECRET']?.trim();
  if (!expected) return;

  const headerSecret = req.get('x-textsms-callback-secret');
  const querySecret = typeof req.query['secret'] === 'string' ? req.query['secret'] : undefined;
  const bodySecret =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)['secret']
      : undefined;
  const provided =
    headerSecret ||
    querySecret ||
    (typeof bodySecret === 'string' ? bodySecret : undefined);

  if (provided !== expected) {
    throw new AppError('Invalid TextSMS callback secret', 401);
  }
};

const buildBusinessSnapshot = async (
  businessId: mongoose.Types.ObjectId
): Promise<BusinessSnapshot | null> => {
  const business = await Business.findById(businessId).select(
    'name managerName contactPhone contactEmail location slug'
  );
  if (!business) return null;

  return {
    businessId: business._id as mongoose.Types.ObjectId,
    name: business['name'],
    ...(business['managerName'] ? { managerName: business['managerName'] } : {}),
    ...(business['contactPhone'] ? { contactPhone: business['contactPhone'] } : {}),
    ...(business['contactEmail'] ? { contactEmail: business['contactEmail'] } : {}),
    ...(business['location'] ? { location: business['location'] } : {}),
    ...(business['slug'] ? { slug: business['slug'] } : {})
  };
};

const mapDeliveryToSmsLogStatus = (
  deliveryStatus: TextSmsDeliveryStatus
): 'sent' | 'delivered' | 'failed' | 'queued' => {
  if (deliveryStatus === 'delivered') return 'delivered';
  if (deliveryStatus === 'undelivered') return 'failed';
  return 'sent';
};

type MatchedSmsLog = {
  _id: mongoose.Types.ObjectId;
  business: mongoose.Types.ObjectId;
  gatewayMessageId?: string | null;
};

const findSmsLogForCallback = async (
  event: ParsedTextSmsCallback
): Promise<{
  log: MatchedSmsLog | null;
  matchedBy: 'message_id' | 'client_sms_id' | 'mobile_recent' | 'unmatched';
}> => {
  if (event.messageId) {
    const byMessageId = await SmsLog.findOne({ gatewayMessageId: event.messageId })
      .select('_id business gatewayMessageId')
      .sort({ createdAt: -1 })
      .lean<MatchedSmsLog>();
    if (byMessageId) {
      return { log: byMessageId, matchedBy: 'message_id' };
    }
  }

  if (event.clientSmsId && mongoose.Types.ObjectId.isValid(event.clientSmsId)) {
    const byClientSmsId = await SmsLog.findById(event.clientSmsId)
      .select('_id business gatewayMessageId')
      .lean<MatchedSmsLog>();
    if (byClientSmsId) {
      return { log: byClientSmsId, matchedBy: 'client_sms_id' };
    }
  }

  const normalizedMobile = event.mobile ? normalizeKenyanMobile(event.mobile) : null;
  if (normalizedMobile) {
    const byMobile = await SmsLog.findOne({
      recipientPhone: normalizedMobile,
      status: { $in: ['queued', 'sent'] }
    })
      .select('_id business gatewayMessageId')
      .sort({ createdAt: -1 })
      .lean<MatchedSmsLog>();
    if (byMobile) {
      return { log: byMobile, matchedBy: 'mobile_recent' };
    }
  }

  return { log: null, matchedBy: 'unmatched' };
};

const processCallbackEvent = async (
  event: ParsedTextSmsCallback,
  rawPayload: unknown
): Promise<void> => {
  const { log, matchedBy } = await findSmsLogForCallback(event);

  let businessSnapshot: BusinessSnapshot | null = null;
  if (log?.['business']) {
    businessSnapshot = await buildBusinessSnapshot(log['business'] as mongoose.Types.ObjectId);
  }

  await SmsDeliveryCallback.create({
    ...(log?._id ? { smsLog: log._id } : {}),
    ...(log?.['business'] ? { business: log['business'] } : {}),
    ...(businessSnapshot ? { businessDetails: businessSnapshot } : {}),
    ...(event.messageId ? { gatewayMessageId: event.messageId } : {}),
    ...(event.mobile ? { recipientPhone: event.mobile } : {}),
    deliveryStatus: event.deliveryStatus,
    ...(event.deliveryDescription ? { deliveryDescription: event.deliveryDescription } : {}),
    rawPayload,
    matchedBy
  });

  if (!log) return;

  const nextStatus = mapDeliveryToSmsLogStatus(event.deliveryStatus);
  const update: Record<string, unknown> = {
    deliveryStatus: event.deliveryStatus,
    lastCallbackAt: new Date(),
    ...(event.deliveryDescription ? { deliveryDescription: event.deliveryDescription } : {}),
    ...(nextStatus === 'delivered' || nextStatus === 'failed' ? { status: nextStatus } : {}),
    ...(nextStatus === 'delivered' ? { deliveredAt: new Date() } : {})
  };

  if (event.messageId && !log['gatewayMessageId']) {
    update['gatewayMessageId'] = event.messageId;
  }

  await SmsLog.findByIdAndUpdate(log._id, update);
};

const textSmsCallbackController = {
  handleDeliveryCallback: catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    if (process.env['NODE_ENV'] === 'development') {
      console.log('[TextSMS callback]', {
        contentType: req.get('content-type'),
        body: req.body
      });
    }

    verifyCallbackSecret(req);

    const events = parseTextSmsCallbackPayload(req.body);
    if (events.length === 0) {
      res.status(200).json({
        status: 'success',
        message: 'Callback received with no parseable events',
        processed: 0
      });
      return;
    }

    await Promise.all(events.map((event) => processCallbackEvent(event, req.body)));

    res.status(200).json({
      status: 'success',
      processed: events.length
    });
  })
};

export default textSmsCallbackController;
