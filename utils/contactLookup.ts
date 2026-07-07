import mongoose from 'mongoose';
import Customer from '../models/customerModel';
import Vehicle from '../models/vehicleModel';
import LoyaltyProfile from '../models/loyaltyProfileModel';
import { normalizePhoneForStorage, normalizePlate } from './contactNormalization';

const plateExprEquals = (normalized: string) => ({
  $eq: [
    {
      $replaceAll: {
        input: { $toUpper: { $trim: { input: '$plate' } } },
        find: ' ',
        replacement: ''
      }
    },
    normalized
  ]
});

const phoneDigitsOnly = (raw: string): string => raw.replace(/\D/g, '');

const phoneSuffix = (raw: string): string => {
  const digits = phoneDigitsOnly(raw);
  return digits.length >= 9 ? digits.slice(-9) : digits;
};

export const toBusinessIdString = (businessId: string | mongoose.Types.ObjectId): string =>
  typeof businessId === 'string' ? businessId : businessId.toString();

export const businessMatches = (
  documentBusiness: unknown,
  businessId: string | mongoose.Types.ObjectId
): boolean => {
  if (!documentBusiness) return false;
  return documentBusiness.toString() === toBusinessIdString(businessId);
};

export const businessScopeQuery = (businessId: string | mongoose.Types.ObjectId) => {
  const businessIdStr = toBusinessIdString(businessId);
  let businessOid: mongoose.Types.ObjectId;
  try {
    businessOid = new mongoose.Types.ObjectId(businessIdStr);
  } catch {
    return { business: businessIdStr };
  }
  return { $or: [{ business: businessOid }, { business: businessIdStr }] };
};

/** All common stored forms for the same Kenyan mobile (254…, 07…, 7……). */
export const phoneLookupValues = (raw: string): string[] => {
  const values = new Set<string>();
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const canonical = normalizePhoneForStorage(trimmed);
  if (canonical) values.add(canonical);

  const digits = phoneDigitsOnly(trimmed);
  if (!digits) return [...values];

  values.add(digits);

  if (digits.startsWith('254') && digits.length === 12) {
    values.add(`0${digits.slice(3)}`);
    values.add(digits.slice(3));
  } else if (digits.startsWith('0') && digits.length === 10) {
    values.add(`254${digits.slice(1)}`);
    values.add(digits.slice(1));
  } else if (digits.length === 9 && digits.startsWith('7')) {
    values.add(`0${digits}`);
    values.add(`254${digits}`);
  }

  return [...values];
};

const pickCustomerForBusiness = (
  customers: Array<InstanceType<typeof Customer>>,
  businessId: string | mongoose.Types.ObjectId
) => customers.find((customer) => businessMatches(customer['business'], businessId)) ?? null;

export const findVehicleByPlate = async (
  businessId: string | mongoose.Types.ObjectId,
  rawPlate: string
) => {
  const normalized = normalizePlate(rawPlate);
  if (!normalized) return null;

  const businessFilter = businessScopeQuery(businessId);

  const exact = await Vehicle.findOne({ ...businessFilter, plate: normalized });
  if (exact) return exact;

  return Vehicle.findOne({
    ...businessFilter,
    $expr: plateExprEquals(normalized)
  });
};

export const findCustomerByPhone = async (
  businessId: string | mongoose.Types.ObjectId,
  rawPhone: string
): Promise<InstanceType<typeof Customer> | null> => {
  const trimmed = rawPhone.trim();
  if (!trimmed) return null;

  const lookupValues = phoneLookupValues(trimmed);
  const suffix = phoneSuffix(trimmed);

  if (lookupValues.length > 0) {
    const byExactPhone = await Customer.find({ phoneNumber: { $in: lookupValues } });
    const exact = pickCustomerForBusiness(byExactPhone, businessId);
    if (exact) return exact;
  }

  if (suffix.length >= 9) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byRegex = await Customer.find({ phoneNumber: { $regex: `${escaped}$` } });
    const regexHit = pickCustomerForBusiness(byRegex, businessId);
    if (regexHit) return regexHit;
  }

  const inBusiness = await Customer.find(businessScopeQuery(businessId)).select(
    'phoneNumber name smsConsent active business'
  );
  if (suffix.length >= 9) {
    const digitHit = inBusiness.find(
      (customer) => phoneSuffix(customer['phoneNumber'] || '') === suffix
    );
    if (digitHit) return digitHit;
  }

  const profilePhones = lookupValues.length > 0 ? lookupValues : [normalizePhoneForStorage(trimmed)];
  const loyaltyProfile = await LoyaltyProfile.findOne({
    ...businessScopeQuery(businessId),
    customerPhoneNumber: { $in: profilePhones }
  });

  if (loyaltyProfile?.['customer']) {
    const linked = await Customer.findById(loyaltyProfile['customer']);
    if (linked && businessMatches(linked['business'], businessId)) {
      return linked;
    }
  }

  return null;
};

export const backfillNormalizedPlate = async (
  vehicle: { plate?: string; save: () => Promise<unknown> }
): Promise<void> => {
  if (!vehicle.plate) return;
  const normalized = normalizePlate(vehicle.plate);
  if (vehicle.plate !== normalized) {
    vehicle.plate = normalized;
    await vehicle.save();
  }
};

export const backfillNormalizedPhone = async (
  customer: { phoneNumber?: string; save: () => Promise<unknown> }
): Promise<void> => {
  if (!customer.phoneNumber) return;
  const normalized = normalizePhoneForStorage(customer.phoneNumber);
  if (customer.phoneNumber !== normalized) {
    customer.phoneNumber = normalized;
    await customer.save();
  }
};

type ResolveOrCreateCustomerParams = {
  businessId: string;
  phoneNumber: string;
  customerName?: string;
  smsConsent?: boolean;
};

export const resolveOrCreateCustomer = async (
  params: ResolveOrCreateCustomerParams
): Promise<InstanceType<typeof Customer>> => {
  const businessOid = new mongoose.Types.ObjectId(params.businessId);
  const normalizedPhone = normalizePhoneForStorage(params.phoneNumber);
  if (!normalizedPhone) {
    throw new Error('A valid customer phone number is required.');
  }

  const existing = await findCustomerByPhone(params.businessId, normalizedPhone);
  if (existing) {
    await backfillNormalizedPhone(existing);
    return existing;
  }

  const loyaltyProfile = await LoyaltyProfile.findOne({
    ...businessScopeQuery(params.businessId),
    customerPhoneNumber: { $in: phoneLookupValues(params.phoneNumber) }
  });

  try {
    const customer = await Customer.create({
      business: businessOid,
      name: params.customerName?.trim() || loyaltyProfile?.['customerName'] || 'Customer',
      phoneNumber: normalizedPhone,
      smsConsent: Boolean(params.smsConsent || loyaltyProfile?.['smsConsent'])
    });

    if (loyaltyProfile && !loyaltyProfile['customer']) {
      loyaltyProfile.set('customer', customer._id);
      await loyaltyProfile.save();
    }

    return customer;
  } catch (createError: unknown) {
    if (
      createError &&
      typeof createError === 'object' &&
      'code' in createError &&
      (createError as { code?: number }).code === 11000
    ) {
      const recovered = await findCustomerByPhone(params.businessId, params.phoneNumber);
      if (recovered) {
        await backfillNormalizedPhone(recovered);
        return recovered;
      }
    }
    throw createError;
  }
};
