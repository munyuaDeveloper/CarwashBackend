import Booking from '../models/bookingModel';
import Business from '../models/businessModel';
import LoyaltyProfile from '../models/loyaltyProfileModel';
import SmsTemplate from '../models/smsTemplateModel';
import SmsLog from '../models/smsLogModel';

type TemplateType = 'loyalty_progress' | 'reward_achievement';

type SmsGatewayResult = {
  success: boolean;
  messageId?: string;
  rawResponse?: unknown;
  error?: string;
};

const normalizeVehicleIdentifier = (raw: string): string => raw.toUpperCase().trim();

const formatPhone = (raw: string): string => raw.trim();

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

const sendViaAfricasTalking = async (to: string, message: string): Promise<SmsGatewayResult> => {
  const username = process.env['AFRICASTALKING_USERNAME'];
  const apiKey = process.env['AFRICASTALKING_API_KEY'];

  if (!username || !apiKey) {
    return {
      success: false,
      error: 'Africa\'s Talking credentials are not configured'
    };
  }

  try {
    const response = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: new URLSearchParams({
        username,
        to,
        message
      })
    });

    const payload = (await response.json().catch(() => ({}))) as {
      SMSMessageData?: { Recipients?: Array<{ messageId?: string; status?: string }> };
      errorMessage?: string;
    };

    if (!response.ok) {
      return {
        success: false,
        error: payload.errorMessage || `Gateway request failed with status ${response.status}`,
        rawResponse: payload
      };
    }

    const firstRecipient = payload.SMSMessageData?.Recipients?.[0];
    return {
      success: true,
      ...(firstRecipient?.messageId ? { messageId: firstRecipient.messageId } : {}),
      rawResponse: payload
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown SMS gateway error'
    };
  }
};

export const processCompletedBookingLoyalty = async (bookingId: string): Promise<void> => {
  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.category !== 'vehicle') return;
  if (booking.status !== 'completed') return;
  if (booking.amount <= 0) return;

  const business = await Business.findById(booking.business);
  if (!business || !business['loyaltySettings']?.enabled) return;

  const vehicleIdentifierRaw = booking.carRegistrationNumber || booking.phoneNumber;
  if (!vehicleIdentifierRaw) return;
  const vehicleIdentifier = normalizeVehicleIdentifier(vehicleIdentifierRaw);
  const customerPhoneRaw = booking.customerPhoneNumber || booking.phoneNumber;

  const profile = await LoyaltyProfile.findOneAndUpdate(
    { business: booking.business, vehicleIdentifier },
    {
      $setOnInsert: {
        business: booking.business,
        vehicleIdentifier
      },
      ...(customerPhoneRaw ? { $set: { customerPhoneNumber: formatPhone(customerPhoneRaw) } } : {}),
      ...(booking.smsConsent ? { $set: { smsConsent: true } } : {})
    },
    { upsert: true, new: true }
  );

  if (!profile) return;
  if (profile['lastCompletedBooking']?.toString() === booking._id.toString()) return;

  const loyaltySettings = business['loyaltySettings'];
  const washesRequired = Math.max(1, Number(loyaltySettings?.washesRequired || 5));
  const allowRewardWashToAccrue = Boolean(loyaltySettings?.allowRewardWashToAccrue);

  let rewardJustEarned = false;
  if (!booking['isRewardWash'] || allowRewardWashToAccrue) {
    profile['totalCompletedPaidWashes'] += 1;
    const completedWashes = profile['totalCompletedPaidWashes'];
    if (completedWashes % washesRequired === 0) {
      rewardJustEarned = true;
      profile['pendingRewards'] += 1;
      profile['totalRewardsEarned'] += 1;
      profile['lastRewardEarnedAt'] = new Date();
    }
  }

  profile.set('lastCompletedBooking', booking._id as unknown as string);
  await profile.save();

  const shouldSendSms =
    Boolean(loyaltySettings?.smsEnabled) &&
    profile['smsConsent'] &&
    typeof profile['customerPhoneNumber'] === 'string' &&
    profile['customerPhoneNumber'].trim().length > 0;

  if (!shouldSendSms) return;
  const customerPhone = profile['customerPhoneNumber'];
  if (typeof customerPhone !== 'string' || customerPhone.trim().length === 0) return;
  const recipientPhone = customerPhone.trim();

  const completedInCycle = profile['totalCompletedPaidWashes'] % washesRequired;
  const remaining = completedInCycle === 0 ? 0 : washesRequired - completedInCycle;
  const messageType: TemplateType = rewardJustEarned ? 'reward_achievement' : 'loyalty_progress';
  const template = await resolveTemplate(business._id.toString(), messageType);
  const customerName = typeof booking['customerName'] === 'string' && booking['customerName'].trim()
    ? booking['customerName'].trim()
    : 'Customer';
  const vehiclePlate = typeof booking.carRegistrationNumber === 'string' && booking.carRegistrationNumber.trim()
    ? booking.carRegistrationNumber.trim().toUpperCase()
    : vehicleIdentifier;
  const message = fillTemplate(template, {
    customerName,
    vehiclePlate,
    businessName: business['name'],
    completedWashes: rewardJustEarned ? washesRequired : completedInCycle,
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
    status: 'queued'
  });

  const gatewayResult = await sendViaAfricasTalking(recipientPhone, message);
  const nextAttempts = (smsLog['attempts'] || 0) + 1;
  await SmsLog.findByIdAndUpdate(smsLog._id, {
    status: gatewayResult.success ? 'sent' : 'failed',
    attempts: nextAttempts,
    gatewayMessageId: gatewayResult.messageId,
    rawGatewayResponse: gatewayResult.rawResponse,
    errorMessage: gatewayResult.error
  });
};
