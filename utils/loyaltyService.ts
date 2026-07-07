import Booking from '../models/bookingModel';
import Business from '../models/businessModel';
import Customer from '../models/customerModel';
import Vehicle from '../models/vehicleModel';
import LoyaltyProfile from '../models/loyaltyProfileModel';
import { ensureVehicleCustomerRegistration } from './customerVehicleService';
import { normalizePhoneForStorage, normalizePlate } from './contactNormalization';
import SmsTemplate from '../models/smsTemplateModel';
import SmsLog from '../models/smsLogModel';
import { normalizeKenyanMobile, sendViaTextSms } from './textSmsService';

type TemplateType = 'loyalty_progress' | 'reward_achievement';

type LoyaltySettings = {
  enabled?: boolean;
  pointsPerHundredKes?: number;
  redemptionPoints?: number;
  redemptionValueKes?: number;
  rewardType?: string;
  earnOnNonOwnedVehicles?: boolean;
  maxPointsEarnedPerDay?: number | null;
  maxRedeemableValuePerMonth?: number | null;
  smsEnabled?: boolean;
  allowRewardWashToAccrue?: boolean;
};

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
  loyaltyPointsRedeemed?: number;
};

export const getTodayKey = (): string => new Date().toISOString().slice(0, 10);
export const getMonthKey = (): string => new Date().toISOString().slice(0, 7);

export const calculatePointsFromAmount = (amount: number, pointsPerHundredKes: number): number => {
  if (amount <= 0 || pointsPerHundredKes <= 0) return 0;
  return Math.floor((amount * pointsPerHundredKes) / 100);
};

export const calculateDiscountFromPoints = (
  points: number,
  redemptionPoints: number,
  redemptionValueKes: number
): number => {
  if (points <= 0 || redemptionPoints <= 0 || redemptionValueKes <= 0) return 0;
  return Math.floor((points * redemptionValueKes) / redemptionPoints);
};

/** Points required to cover a service price (e.g. KSh 250 wash → 250 pts at 1:1 rate). */
export const calculatePointsNeededForAmount = (
  amountKes: number,
  redemptionPoints: number,
  redemptionValueKes: number
): number => {
  if (amountKes <= 0 || redemptionPoints <= 0 || redemptionValueKes <= 0) return 0;
  return Math.ceil((amountKes * redemptionPoints) / redemptionValueKes);
};

export const canRedeemFullService = (
  pointsBalance: number,
  servicePriceKes: number,
  redemptionPoints: number,
  redemptionValueKes: number
): boolean => {
  if (servicePriceKes <= 0 || pointsBalance <= 0) return false;
  return pointsBalance >= calculatePointsNeededForAmount(servicePriceKes, redemptionPoints, redemptionValueKes);
};

/** Max points redeemable toward a service (capped at service price, not full balance). */
export const calculateMaxRedeemableForService = (
  pointsBalance: number,
  servicePriceKes: number,
  redemptionPoints: number,
  redemptionValueKes: number
): number => {
  const forService = calculatePointsNeededForAmount(servicePriceKes, redemptionPoints, redemptionValueKes);
  return Math.min(Math.max(0, pointsBalance), forService);
};

const formatPhone = (raw: string): string => normalizePhoneForStorage(raw);

const resolveVehicleIdentifier = async (booking: BookingForLoyalty): Promise<string | null> => {
  if (typeof booking.carRegistrationNumber === 'string' && booking.carRegistrationNumber.trim()) {
    return normalizePlate(booking.carRegistrationNumber);
  }

  const vehicleRef = booking.vehicle;
  if (vehicleRef) {
    if (typeof vehicleRef === 'object' && vehicleRef !== null && 'plate' in vehicleRef) {
      const plate = (vehicleRef as { plate?: string }).plate;
      if (plate?.trim()) {
        return normalizePlate(plate);
      }
    }
    const vehicleId =
      typeof vehicleRef === 'object' && vehicleRef !== null && '_id' in vehicleRef
        ? (vehicleRef as { _id: { toString: () => string } })._id.toString()
        : String(vehicleRef);
    const vehicleDoc = await Vehicle.findById(vehicleId).select('plate customer');
    if (vehicleDoc?.['plate']) {
      return normalizePlate(vehicleDoc['plate']);
    }
  }

  return null;
};

const resolveCustomerContact = async (
  booking: BookingForLoyalty
): Promise<{ phone?: string; customerName?: string; customerId?: string; smsConsent: boolean }> => {
  let phone = booking.customerPhoneNumber || booking.phoneNumber || undefined;
  let customerName =
    typeof booking.customerName === 'string' && booking.customerName.trim()
      ? booking.customerName.trim()
      : undefined;
  let customerId: string | undefined;
  let smsConsent = Boolean(booking.smsConsent);

  const customerRef = booking.customer;
  if (customerRef) {
    if (typeof customerRef === 'object' && customerRef !== null) {
      const customerObj = customerRef as {
        _id?: { toString: () => string };
        name?: string;
        phoneNumber?: string;
        smsConsent?: boolean;
      };
      if (customerObj._id) customerId = customerObj._id.toString();
      if (customerObj.phoneNumber) phone = customerObj.phoneNumber;
      if (customerObj.name) customerName = customerObj.name;
      if (customerObj.smsConsent) smsConsent = true;
    } else {
      customerId = String(customerRef);
      const customer = await Customer.findById(customerId).select('name phoneNumber smsConsent');
      if (customer) {
        if (customer['phoneNumber']) phone = customer['phoneNumber'];
        if (customer['name']) customerName = customer['name'];
        if (customer['smsConsent']) smsConsent = true;
      }
    }
  }

  return {
    ...(phone ? { phone } : {}),
    ...(customerName ? { customerName } : {}),
    ...(customerId ? { customerId } : {}),
    smsConsent
  };
};

const payerOwnsVehicle = async (booking: BookingForLoyalty, payerCustomerId?: string): Promise<boolean> => {
  if (!payerCustomerId) return false;
  const vehicleRef = booking.vehicle;
  if (!vehicleRef) return false;

  let vehicleCustomerId: string | undefined;
  if (typeof vehicleRef === 'object' && vehicleRef !== null) {
    const vehicleObj = vehicleRef as { customer?: { toString: () => string } | string };
    if (vehicleObj.customer) {
      vehicleCustomerId =
        typeof vehicleObj.customer === 'object'
          ? vehicleObj.customer.toString()
          : String(vehicleObj.customer);
    }
  } else {
    const vehicleDoc = await Vehicle.findById(String(vehicleRef)).select('customer');
    if (vehicleDoc?.['customer']) {
      vehicleCustomerId = vehicleDoc['customer'].toString();
    }
  }

  return Boolean(vehicleCustomerId && vehicleCustomerId === payerCustomerId);
};

const buildDefaultTemplate = (type: TemplateType): string => {
  if (type === 'reward_achievement') {
    return 'Congratulations {{customer_name}}! Your {{points_balance}} points at {{business_name}} can cover your next wash. See you soon!';
  }
  return 'Hi {{customer_name}}! You earned {{points_earned}} points at {{business_name}} ({{points_balance}} total). {{points_to_redeem}} more for KSh {{service_amount_kes}} off!';
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
    pointsEarned: number;
    pointsBalance: number;
    pointsToRedeem: number;
    pointsNeededForWash: number;
    serviceAmountKes: number;
    redemptionValueKes: number;
  }
): string => {
  const replacements: Array<[string, string]> = [
    ['{{customer_name}}', params.customerName],
    ['{customer_name}', params.customerName],
    ['{{vehicle_plate}}', params.vehiclePlate],
    ['{vehicle_plate}', params.vehiclePlate],
    ['{{business_name}}', params.businessName],
    ['{business_name}', params.businessName],
    ['{{points_earned}}', String(params.pointsEarned)],
    ['{points_earned}', String(params.pointsEarned)],
    ['{{points_balance}}', String(params.pointsBalance)],
    ['{points_balance}', String(params.pointsBalance)],
    ['{{points_to_redeem}}', String(params.pointsToRedeem)],
    ['{points_to_redeem}', String(params.pointsToRedeem)],
    ['{{points_needed_for_wash}}', String(params.pointsNeededForWash)],
    ['{points_needed_for_wash}', String(params.pointsNeededForWash)],
    ['{{service_amount_kes}}', String(params.serviceAmountKes)],
    ['{service_amount_kes}', String(params.serviceAmountKes)],
    ['{{redemption_value_kes}}', String(params.redemptionValueKes)],
    ['{redemption_value_kes}', String(params.redemptionValueKes)],
    // Legacy wash-count placeholders (points migration)
    ['{{completed_washes}}', String(params.pointsBalance)],
    ['{completed_washes}', String(params.pointsBalance)],
    ['{{required_washes}}', String(params.pointsNeededForWash)],
    ['{required_washes}', String(params.pointsNeededForWash)],
    ['{{remaining_washes}}', String(params.pointsToRedeem)],
    ['{remaining_washes}', String(params.pointsToRedeem)]
  ];

  return replacements.reduce((message, [token, value]) => message.replaceAll(token, value), rawTemplate);
};

const logLoyaltySkip = (bookingId: string, reason: string): void => {
  if (process.env['NODE_ENV'] === 'development') {
    console.warn(`[loyalty] skipped booking ${bookingId}: ${reason}`);
  }
};

const getSettingsValues = (settings: LoyaltySettings) => ({
  pointsPerHundredKes: Math.max(0.01, Number(settings.pointsPerHundredKes ?? 10)),
  redemptionPoints: Math.max(1, Number(settings.redemptionPoints ?? 500)),
  redemptionValueKes: Math.max(1, Number(settings.redemptionValueKes ?? 500)),
  earnOnNonOwnedVehicles: settings.earnOnNonOwnedVehicles !== false,
  maxPointsEarnedPerDay:
    settings.maxPointsEarnedPerDay === null || settings.maxPointsEarnedPerDay === undefined
      ? null
      : Math.max(0, Number(settings.maxPointsEarnedPerDay)),
  maxRedeemableValuePerMonth:
    settings.maxRedeemableValuePerMonth === null || settings.maxRedeemableValuePerMonth === undefined
      ? null
      : Math.max(0, Number(settings.maxRedeemableValuePerMonth)),
  allowRewardWashToAccrue: Boolean(settings.allowRewardWashToAccrue)
});

export const getLoyaltyProfileByPhone = async (
  businessId: string,
  phone: string
): Promise<Record<string, unknown> | null> => {
  const normalizedPhone = formatPhone(phone);
  if (!normalizedPhone) return null;

  let profile = await LoyaltyProfile.findOne({
    business: businessId,
    customerPhoneNumber: normalizedPhone
  });

  if (!profile && normalizedPhone.startsWith('254') && normalizedPhone.length === 12) {
    profile = await LoyaltyProfile.findOne({
      business: businessId,
      customerPhoneNumber: `0${normalizedPhone.slice(3)}`
    });
  }

  return profile ? (profile.toObject() as Record<string, unknown>) : null;
};

export const processCompletedBookingLoyalty = async (bookingId: string): Promise<void> => {
  const booking = await Booking.findById(bookingId)
    .populate('vehicle', 'plate customer')
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

  const loyaltySettings = business['loyaltySettings'] as LoyaltySettings;
  const settings = getSettingsValues(loyaltySettings);

  const { phone: customerPhoneRaw, customerName, customerId, smsConsent: smsConsentForProfile } =
    await resolveCustomerContact(booking as BookingForLoyalty);

  if (!customerPhoneRaw?.trim()) {
    logLoyaltySkip(bookingId, 'no paying customer phone on booking');
    return;
  }

  const customerPhone = formatPhone(customerPhoneRaw);
  const vehicleIdentifier = await resolveVehicleIdentifier(booking as BookingForLoyalty);

  let linkedCustomerId = customerId;
  if (!booking.vehicle && vehicleIdentifier && customerPhone) {
    const registered = await ensureVehicleCustomerRegistration({
      businessId: booking.business.toString(),
      plate: vehicleIdentifier,
      phoneNumber: customerPhone,
      ...(customerName ? { customerName } : {}),
      ...(typeof booking.vehicleType === 'string' && booking.vehicleType.trim()
        ? { vehicleType: booking.vehicleType.trim() }
        : {}),
      ...(smsConsentForProfile ? { smsConsent: true } : {})
    });

    await Booking.findByIdAndUpdate(bookingId, {
      vehicle: registered.vehicleId,
      customer: registered.customerId,
      carRegistrationNumber: registered.plate,
      customerName: registered.customerName,
      customerPhoneNumber: registered.customerPhoneNumber,
      smsConsent: registered.smsConsent
    });

    booking.set('vehicle', registered.vehicleId);
    booking.set('customer', registered.customerId);
    booking.set('carRegistrationNumber', registered.plate);
    booking.set('customerName', registered.customerName);
    booking.set('customerPhoneNumber', registered.customerPhoneNumber);
    booking.set('smsConsent', registered.smsConsent);
    linkedCustomerId = registered.customerId.toString();
  }

  const pointsToRedeem = Math.max(0, Number(booking['loyaltyPointsRedeemed'] || 0));
  const discountKes =
    pointsToRedeem > 0
      ? calculateDiscountFromPoints(
          pointsToRedeem,
          settings.redemptionPoints,
          settings.redemptionValueKes
        )
      : 0;
  const serviceValueKes = booking.amount + discountKes;

  if (pointsToRedeem > 0 && serviceValueKes <= 0) {
    throw new Error('Cannot redeem points without a service value on the booking.');
  }

  if (pointsToRedeem > 0) {
    const maxPointsForService = calculatePointsNeededForAmount(
      serviceValueKes,
      settings.redemptionPoints,
      settings.redemptionValueKes
    );
    if (pointsToRedeem > maxPointsForService) {
      throw new Error(
        `Cannot redeem more than ${maxPointsForService} points for a KSh ${serviceValueKes} service.`
      );
    }
  }

  const allowRewardWashToAccrue = settings.allowRewardWashToAccrue;
  const shouldEarnPoints =
    (!booking['isRewardWash'] && pointsToRedeem === 0) || allowRewardWashToAccrue;

  if (shouldEarnPoints && !settings.earnOnNonOwnedVehicles) {
    const ownsVehicle = await payerOwnsVehicle(booking as BookingForLoyalty, linkedCustomerId);
    if (!ownsVehicle) {
      logLoyaltySkip(bookingId, 'payer does not own vehicle and earnOnNonOwnedVehicles is disabled');
      if (pointsToRedeem === 0) {
        await Booking.findByIdAndUpdate(bookingId, { loyaltyProcessed: true });
        return;
      }
    }
  }

  let profile = await LoyaltyProfile.findOne({
    business: booking.business,
    customerPhoneNumber: customerPhone
  });

  if (!profile) {
    profile = await LoyaltyProfile.create({
      business: booking.business,
      customerPhoneNumber: customerPhone,
      customerName,
      ...(linkedCustomerId ? { customer: linkedCustomerId } : {}),
      smsConsent: smsConsentForProfile
    });
  }

  if (!profile) {
    logLoyaltySkip(bookingId, 'failed to load loyalty profile');
    return;
  }

  const todayKey = getTodayKey();
  const monthKey = getMonthKey();
  let pointsEarned = 0;
  let pointsRedeemedApplied = 0;
  let discountApplied = 0;

  if (pointsToRedeem > 0) {
    const currentBalance = profile['pointsBalance'] || 0;
    if (pointsToRedeem > currentBalance) {
      throw new Error(
        `Insufficient loyalty points. Customer has ${currentBalance} points but ${pointsToRedeem} were requested.`
      );
    }

    const currentMonthRedeemed =
      profile['redeemValueMonthKey'] === monthKey ? profile['redeemValueThisMonth'] || 0 : 0;
    if (
      settings.maxRedeemableValuePerMonth !== null &&
      currentMonthRedeemed + discountKes > settings.maxRedeemableValuePerMonth
    ) {
      throw new Error(
        `Monthly redemption limit exceeded. Remaining this month: KSh ${Math.max(
          0,
          settings.maxRedeemableValuePerMonth - currentMonthRedeemed
        )}.`
      );
    }

    pointsRedeemedApplied = pointsToRedeem;
    discountApplied = discountKes;

    profile = await LoyaltyProfile.findByIdAndUpdate(
      profile._id,
      {
        $inc: {
          pointsBalance: -pointsRedeemedApplied,
          totalPointsRedeemed: pointsRedeemedApplied
        },
        $set: {
          redeemValueThisMonth: currentMonthRedeemed + discountApplied,
          redeemValueMonthKey: monthKey,
          lastRedeemedAt: new Date(),
          lastCompletedBooking: booking._id,
          ...(customerName ? { customerName } : {}),
          ...(linkedCustomerId ? { customer: linkedCustomerId } : {}),
          ...(vehicleIdentifier ? { lastVehicleIdentifier: vehicleIdentifier } : {}),
          ...(smsConsentForProfile ? { smsConsent: true } : {})
        }
      },
      { new: true }
    );
  }

  if (!profile) {
    logLoyaltySkip(bookingId, 'profile missing after redemption');
    return;
  }

  if (shouldEarnPoints) {
    let rawPoints = calculatePointsFromAmount(booking.amount, settings.pointsPerHundredKes);

    const earnedToday =
      profile['pointsEarnedTodayDate'] === todayKey ? profile['pointsEarnedToday'] || 0 : 0;
    if (settings.maxPointsEarnedPerDay !== null) {
      const remainingToday = Math.max(0, settings.maxPointsEarnedPerDay - earnedToday);
      rawPoints = Math.min(rawPoints, remainingToday);
    }

    pointsEarned = rawPoints;

    if (pointsEarned > 0) {
      profile = await LoyaltyProfile.findByIdAndUpdate(
        profile._id,
        {
          $inc: {
            pointsBalance: pointsEarned,
            totalPointsEarned: pointsEarned,
            pointsEarnedToday: pointsEarned
          },
          $set: {
            pointsEarnedTodayDate: todayKey,
            lastPointsEarnedAt: new Date(),
            lastCompletedBooking: booking._id,
            ...(customerName ? { customerName } : {}),
            ...(linkedCustomerId ? { customer: linkedCustomerId } : {}),
            ...(vehicleIdentifier ? { lastVehicleIdentifier: vehicleIdentifier } : {}),
            ...(smsConsentForProfile ? { smsConsent: true } : {})
          }
        },
        { new: true }
      );

      if (process.env['NODE_ENV'] === 'development' && profile) {
        console.log(
          `[loyalty] +${pointsEarned} pts for ${customerPhone}, balance=${profile['pointsBalance']}`
        );
      }
    } else if (pointsToRedeem === 0) {
      await LoyaltyProfile.findByIdAndUpdate(profile._id, {
        $set: {
          lastCompletedBooking: booking._id,
          ...(customerName ? { customerName } : {}),
          ...(linkedCustomerId ? { customer: linkedCustomerId } : {}),
          ...(vehicleIdentifier ? { lastVehicleIdentifier: vehicleIdentifier } : {}),
          ...(smsConsentForProfile ? { smsConsent: true } : {})
        }
      });
    }
  } else if (pointsToRedeem === 0) {
    await LoyaltyProfile.findByIdAndUpdate(profile._id, {
      $set: {
        lastCompletedBooking: booking._id,
        ...(customerName ? { customerName } : {}),
        ...(linkedCustomerId ? { customer: linkedCustomerId } : {}),
        ...(vehicleIdentifier ? { lastVehicleIdentifier: vehicleIdentifier } : {}),
        ...(smsConsentForProfile ? { smsConsent: true } : {})
      }
    });
  }

  if (!profile) {
    logLoyaltySkip(bookingId, 'profile missing after earning');
    return;
  }

  const balanceAfter = profile['pointsBalance'] || 0;
  const servicePriceForSms =
    pointsRedeemedApplied > 0 ? serviceValueKes : booking.amount;
  const pointsNeededForService = calculatePointsNeededForAmount(
    servicePriceForSms,
    settings.redemptionPoints,
    settings.redemptionValueKes
  );
  const crossedRedemptionThreshold =
    pointsEarned > 0 &&
    pointsNeededForService > 0 &&
    balanceAfter >= pointsNeededForService;
  const pointsToNextRedeem = Math.max(0, pointsNeededForService - balanceAfter);

  await Booking.findByIdAndUpdate(bookingId, {
    loyaltyProcessed: true,
    loyaltyPointsEarned: pointsEarned,
    loyaltyPointsRedeemed: pointsRedeemedApplied,
    loyaltyDiscountKes: discountApplied
  });

  const messageType: TemplateType = crossedRedemptionThreshold
    ? 'reward_achievement'
    : 'loyalty_progress';

  const resolveSkipReason = (): string | null => {
    if (!loyaltySettings?.smsEnabled) return 'SMS notifications are disabled in loyalty settings';
    if (!profile['smsConsent']) return 'Customer has not consented to SMS';
    if (
      typeof profile['customerPhoneNumber'] !== 'string' ||
      profile['customerPhoneNumber'].trim().length === 0
    ) {
      return 'No customer phone number on booking or customer profile';
    }
    if (pointsEarned === 0 && pointsRedeemedApplied === 0) {
      return 'No points earned or redeemed on this booking';
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
      recipientPhone: customerPhone,
      message: `[Not sent] ${skipReason}`,
      gatewayProvider: 'textsms',
      status: 'skipped',
      errorMessage: skipReason
    });
    return;
  }

  const recipientPhone = normalizeKenyanMobile(customerPhone) || customerPhone;
  const template = await resolveTemplate(business._id.toString(), messageType);
  const displayCustomerName = customerName || 'Customer';
  const vehiclePlate = vehicleIdentifier || 'vehicle';
  const message = fillTemplate(template, {
    customerName: displayCustomerName,
    vehiclePlate,
    businessName: business['name'],
    pointsEarned,
    pointsBalance: balanceAfter,
    pointsToRedeem: pointsToNextRedeem,
    pointsNeededForWash: pointsNeededForService,
    serviceAmountKes: servicePriceForSms,
    redemptionValueKes: settings.redemptionValueKes
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
