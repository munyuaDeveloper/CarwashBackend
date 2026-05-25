import Booking from '../models/bookingModel';
import Business from '../models/businessModel';
import Customer from '../models/customerModel';
import Vehicle from '../models/vehicleModel';
import LoyaltyProfile from '../models/loyaltyProfileModel';
import SmsTemplate from '../models/smsTemplateModel';
import SmsLog from '../models/smsLogModel';
import { normalizeKenyanMobile, sendViaTextSms } from './textSmsService';

type TemplateType = 'loyalty_progress' | 'reward_achievement';

type BookingForLoyalty = {
  _id: { toString: () => string };
  business: { toString: () => string };
  category: string;
  status: string;
  amount: number;
  carRegistrationNumber?: string | null;
  phoneNumber?: string | null;
  customerPhoneNumber?: string | null;
  customerName?: string | null;
  customer?: unknown;
  vehicle?: unknown;
  smsConsent?: boolean;
  isRewardWash?: boolean;
  loyaltyProcessed?: boolean;
};

const normalizeVehicleIdentifier = (raw: string): string => raw.toUpperCase().trim();

const formatPhone = (raw: string): string => raw.trim();

const resolveVehicleIdentifier = async (booking: BookingForLoyalty): Promise<string | null> => {
  if (typeof booking.carRegistrationNumber === 'string' && booking.carRegistrationNumber.trim()) {
    return normalizeVehicleIdentifier(booking.carRegistrationNumber);
  }

  const vehicleRef = booking.vehicle;
  if (vehicleRef) {
    if (typeof vehicleRef === 'object' && vehicleRef !== null && 'plate' in vehicleRef) {
      const plate = (vehicleRef as { plate?: string }).plate;
      if (plate?.trim()) {
        return normalizeVehicleIdentifier(plate);
      }
    }
    const vehicleId =
      typeof vehicleRef === 'object' && vehicleRef !== null && '_id' in vehicleRef
        ? (vehicleRef as { _id: { toString: () => string } })._id.toString()
        : String(vehicleRef);
    const vehicleDoc = await Vehicle.findById(vehicleId).select('plate');
    if (vehicleDoc?.['plate']) {
      return normalizeVehicleIdentifier(vehicleDoc['plate']);
    }
  }

  if (typeof booking.phoneNumber === 'string' && booking.phoneNumber.trim()) {
    return normalizeVehicleIdentifier(booking.phoneNumber);
  }

  return null;
};

const resolveCustomerContact = async (
  booking: BookingForLoyalty
): Promise<{ phone?: string; smsConsent: boolean }> => {
  let phone = booking.customerPhoneNumber || booking.phoneNumber || undefined;
  let smsConsent = Boolean(booking.smsConsent);

  const customerRef = booking.customer;
  if (customerRef) {
    if (typeof customerRef === 'object' && customerRef !== null) {
      const customerObj = customerRef as { phoneNumber?: string; smsConsent?: boolean };
      if (customerObj.phoneNumber) phone = customerObj.phoneNumber;
      if (customerObj.smsConsent) smsConsent = true;
    } else {
      const customer = await Customer.findById(String(customerRef)).select('phoneNumber smsConsent');
      if (customer) {
        if (customer['phoneNumber']) phone = customer['phoneNumber'];
        if (customer['smsConsent']) smsConsent = true;
      }
    }
  }

  return { ...(phone ? { phone } : {}), smsConsent };
};

const buildDefaultTemplate = (type: TemplateType): string => {
  if (type === 'reward_achievement') {
    return '🎉 Congratulations {{customer_name}}!\n\nYou have officially earned a FREE car wash for vehicle {{vehicle_plate}} at {{business_name}} after completing {{required_washes}} washes.\n\nVisit us anytime to redeem your reward. Thank you for your loyalty!';
  }
  return 'Hello {{customer_name}}, your wash for vehicle {{vehicle_plate}} at {{business_name}} was completed successfully.\n\nLoyalty Progress: {{completed_washes}}/{{required_washes}}\n\nYou are just {{remaining_washes}} wash(es) away from your FREE wash reward. 🎉';
};

const resolveTemplate = async (businessId: string, type: TemplateType): Promise<string> => {
  const template = await SmsTemplate.findOne({
    business: businessId,
    type,
    status: 'approved'
  });
  return template?.['content'] || buildDefaultTemplate(type);
};

const fillTemplate = (
  rawTemplate: string,
  params: {
    customerName: string;
    vehiclePlate: string;
    businessName: string;
    completedWashes: number;
    requiredWashes: number;
    remainingWashes: number;
  }
): string => {
  return rawTemplate
    .replaceAll('{{customer_name}}', params.customerName)
    .replaceAll('{customer_name}', params.customerName)
    .replaceAll('{{vehicle_plate}}', params.vehiclePlate)
    .replaceAll('{vehicle_plate}', params.vehiclePlate)
    .replaceAll('{{business_name}}', params.businessName)
    .replaceAll('{business_name}', params.businessName)
    .replaceAll('{{completed_washes}}', String(params.completedWashes))
    .replaceAll('{completed_washes}', String(params.completedWashes))
    .replaceAll('{{required_washes}}', String(params.requiredWashes))
    .replaceAll('{required_washes}', String(params.requiredWashes))
    .replaceAll('{{remaining_washes}}', String(params.remainingWashes))
    .replaceAll('{remaining_washes}', String(params.remainingWashes));
};

const logLoyaltySkip = (bookingId: string, reason: string): void => {
  if (process.env['NODE_ENV'] === 'development') {
    console.warn(`[loyalty] skipped booking ${bookingId}: ${reason}`);
  }
};

export const processCompletedBookingLoyalty = async (bookingId: string): Promise<void> => {
  const booking = await Booking.findById(bookingId)
    .populate('vehicle', 'plate')
    .populate('customer', 'name phoneNumber smsConsent');

  if (!booking) {
    logLoyaltySkip(bookingId, 'booking not found');
    return;
  }
  if (booking.category !== 'vehicle') {
    logLoyaltySkip(bookingId, `category is "${booking.category}", not vehicle`);
    return;
  }
  if (booking.status !== 'completed') {
    logLoyaltySkip(bookingId, `status is "${booking.status}", not completed`);
    return;
  }
  if (booking.amount < 0) {
    logLoyaltySkip(bookingId, 'amount is negative');
    return;
  }
  if (booking['loyaltyProcessed']) {
    logLoyaltySkip(bookingId, 'loyalty already processed for this booking');
    return;
  }

  const business = await Business.findById(booking.business);
  if (!business || !business['loyaltySettings']?.enabled) {
    logLoyaltySkip(bookingId, 'loyalty program is not enabled on this business');
    return;
  }

  const vehicleIdentifier = await resolveVehicleIdentifier(booking as BookingForLoyalty);
  if (!vehicleIdentifier) {
    logLoyaltySkip(bookingId, 'no vehicle plate or identifier on booking');
    return;
  }

  const { phone: customerPhoneRaw, smsConsent: smsConsentForProfile } = await resolveCustomerContact(
    booking as BookingForLoyalty
  );

  const loyaltySettings = business['loyaltySettings'];
  const washesRequired = Math.max(1, Number(loyaltySettings?.washesRequired || 5));
  const allowRewardWashToAccrue = Boolean(loyaltySettings?.allowRewardWashToAccrue);
  const shouldAccrueWash = !booking['isRewardWash'] || allowRewardWashToAccrue;

  const contactSet: Record<string, string | boolean> = {};
  if (customerPhoneRaw) {
    contactSet['customerPhoneNumber'] = formatPhone(customerPhoneRaw);
  }
  if (smsConsentForProfile) {
    contactSet['smsConsent'] = true;
  }

  const profileUpdate: Record<string, unknown> = {
    $set: {
      lastCompletedBooking: booking._id,
      ...contactSet
    },
    $setOnInsert: {
      business: booking.business,
      vehicleIdentifier
    }
  };

  if (shouldAccrueWash) {
    profileUpdate['$inc'] = { totalCompletedPaidWashes: 1 };
  }

  let profile = await LoyaltyProfile.findOneAndUpdate(
    { business: booking.business, vehicleIdentifier },
    profileUpdate,
    { upsert: true, new: true }
  );

  if (!profile) {
    logLoyaltySkip(bookingId, 'failed to upsert loyalty profile');
    return;
  }

  if (process.env['NODE_ENV'] === 'development') {
    console.log(
      `[loyalty] profile updated for ${vehicleIdentifier}: washes=${profile['totalCompletedPaidWashes']}`
    );
  }

  let rewardJustEarned = false;
  if (shouldAccrueWash) {
    const completedWashes = profile['totalCompletedPaidWashes'];
    if (completedWashes > 0 && completedWashes % washesRequired === 0) {
      rewardJustEarned = true;
      const rewardedProfile = await LoyaltyProfile.findByIdAndUpdate(
        profile._id,
        {
          $inc: { pendingRewards: 1, totalRewardsEarned: 1 },
          $set: { lastRewardEarnedAt: new Date() }
        },
        { new: true }
      );
      if (rewardedProfile) {
        profile = rewardedProfile;
      }
    }
  }

  await Booking.findByIdAndUpdate(bookingId, { loyaltyProcessed: true });

  const completedInCycle = profile['totalCompletedPaidWashes'] % washesRequired;
  const messageType: TemplateType = rewardJustEarned ? 'reward_achievement' : 'loyalty_progress';

  const resolveSkipReason = (): string | null => {
    if (!loyaltySettings?.smsEnabled) return 'SMS notifications are disabled in loyalty settings';
    if (!profile['smsConsent']) return 'Customer has not consented to SMS';
    if (
      typeof profile['customerPhoneNumber'] !== 'string' ||
      profile['customerPhoneNumber'].trim().length === 0
    ) {
      return 'No customer phone number on booking or customer profile';
    }
    return null;
  };

  const skipReason = resolveSkipReason();
  if (skipReason) {
    await SmsLog.create({
      business: booking.business,
      booking: booking._id,
      loyaltyProfile: profile._id,
      templateType: messageType,
      recipientPhone:
        (typeof profile['customerPhoneNumber'] === 'string' && profile['customerPhoneNumber'].trim()) ||
        (customerPhoneRaw ? formatPhone(customerPhoneRaw) : 'unknown'),
      message: `[Not sent] ${skipReason}`,
      gatewayProvider: 'textsms',
      status: 'skipped',
      errorMessage: skipReason
    });
    return;
  }

  const customerPhone = profile['customerPhoneNumber'];
  if (typeof customerPhone !== 'string' || customerPhone.trim().length === 0) return;
  const recipientPhone =
    normalizeKenyanMobile(customerPhone.trim()) || customerPhone.trim();

  const remaining =
    rewardJustEarned || completedInCycle === 0 ? 0 : washesRequired - completedInCycle;
  const template = await resolveTemplate(business._id.toString(), messageType);
  const customerName =
    typeof booking['customerName'] === 'string' && booking['customerName'].trim()
      ? booking['customerName'].trim()
      : 'Customer';
  const vehiclePlate =
    typeof booking.carRegistrationNumber === 'string' && booking.carRegistrationNumber.trim()
      ? booking.carRegistrationNumber.trim().toUpperCase()
      : vehicleIdentifier;
  const message = fillTemplate(template, {
    customerName,
    vehiclePlate,
    businessName: business['name'],
    completedWashes: rewardJustEarned
      ? washesRequired
      : profile['totalCompletedPaidWashes'] % washesRequired || washesRequired,
    requiredWashes: washesRequired,
    remainingWashes: remaining
  });

  const smsLog = await SmsLog.create({
    business: booking.business,
    booking: booking._id,
    loyaltyProfile: profile._id,
    templateType: messageType,
    recipientPhone,
    message,
    gatewayProvider: 'textsms',
    status: 'queued'
  });

  const gatewayResult = await sendViaTextSms(recipientPhone, message, {
    clientSmsId: smsLog._id.toString()
  });
  const nextAttempts = (smsLog['attempts'] || 0) + 1;
  await SmsLog.findByIdAndUpdate(smsLog._id, {
    status: gatewayResult.success ? 'sent' : 'failed',
    attempts: nextAttempts,
    gatewayMessageId: gatewayResult.messageId,
    rawGatewayResponse: gatewayResult.rawResponse,
    errorMessage: gatewayResult.error
  });
};
