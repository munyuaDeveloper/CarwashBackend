import mongoose from 'mongoose';
import Customer from '../models/customerModel';
import Vehicle from '../models/vehicleModel';
import {
  backfillNormalizedPhone,
  backfillNormalizedPlate,
  findVehicleByPlate,
  resolveOrCreateCustomer
} from './contactLookup';
import { normalizePhoneForStorage, normalizePlate } from './contactNormalization';

type EnsureVehicleCustomerParams = {
  businessId: string;
  plate: string;
  phoneNumber: string;
  customerName?: string;
  vehicleType?: string;
  smsConsent?: boolean;
};

export type EnsureVehicleCustomerResult = {
  vehicleId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  plate: string;
  customerName: string;
  customerPhoneNumber: string;
  smsConsent: boolean;
};

const applyCustomerUpdates = async (
  customer: InstanceType<typeof Customer>,
  params: { customerName?: string; smsConsent?: boolean }
): Promise<void> => {
  let dirty = false;

  const trimmedName = params.customerName?.trim();
  if (trimmedName && customer['name'] !== trimmedName) {
    customer.set('name', trimmedName);
    dirty = true;
  }

  if (params.smsConsent === true && !customer['smsConsent']) {
    customer.set('smsConsent', true);
    dirty = true;
  }

  if (dirty) {
    await customer.save();
  }
};

export const ensureVehicleCustomerRegistration = async (
  params: EnsureVehicleCustomerParams
): Promise<EnsureVehicleCustomerResult> => {
  const plate = normalizePlate(params.plate);
  const phoneNumber = normalizePhoneForStorage(params.phoneNumber);
  const businessOid = new mongoose.Types.ObjectId(params.businessId);

  if (!plate || !phoneNumber) {
    throw new Error('Plate and phone number are required to register a vehicle customer.');
  }

  let vehicle = await findVehicleByPlate(businessOid, plate);
  if (vehicle) {
    await backfillNormalizedPlate(vehicle);
    const customer = await Customer.findById(vehicle['customer']);
    if (!customer || customer['business'].toString() !== params.businessId) {
      throw new Error(`Vehicle ${plate} exists but is missing a valid customer link.`);
    }

    await backfillNormalizedPhone(customer);
    await applyCustomerUpdates(customer, params);

    if (params.vehicleType?.trim() && vehicle['vehicleType'] !== params.vehicleType.trim()) {
      vehicle.set('vehicleType', params.vehicleType.trim());
      await vehicle.save();
    }

    return {
      vehicleId: vehicle._id,
      customerId: customer._id,
      plate,
      customerName: customer['name'],
      customerPhoneNumber: customer['phoneNumber'],
      smsConsent: Boolean(customer['smsConsent'])
    };
  }

  const customer = await resolveOrCreateCustomer({
    businessId: params.businessId,
    phoneNumber: params.phoneNumber,
    ...(params.customerName ? { customerName: params.customerName } : {}),
    ...(params.smsConsent === true ? { smsConsent: true } : {})
  });

  await applyCustomerUpdates(customer, params);

  try {
    vehicle = await Vehicle.create({
      business: businessOid,
      customer: customer._id,
      plate,
      ...(params.vehicleType?.trim() ? { vehicleType: params.vehicleType.trim() } : {})
    });
  } catch (createError: unknown) {
    if (
      createError &&
      typeof createError === 'object' &&
      'code' in createError &&
      (createError as { code?: number }).code === 11000
    ) {
      vehicle = await findVehicleByPlate(businessOid, plate);
      if (!vehicle) {
        throw new Error('A vehicle with this plate already exists for your business.');
      }
    } else {
      throw createError;
    }
  }

  return {
    vehicleId: vehicle._id,
    customerId: customer._id,
    plate,
    customerName: customer['name'],
    customerPhoneNumber: customer['phoneNumber'],
    smsConsent: Boolean(customer['smsConsent'])
  };
};

type EnsureCustomerParams = {
  businessId: string;
  phoneNumber: string;
  customerName?: string;
};

export type EnsureCustomerResult = {
  customerId: mongoose.Types.ObjectId;
  customerName: string;
  customerPhoneNumber: string;
};

export const ensureCustomerRegistration = async (
  params: EnsureCustomerParams
): Promise<EnsureCustomerResult> => {
  const phoneNumber = normalizePhoneForStorage(params.phoneNumber);

  if (!phoneNumber) {
    throw new Error('Phone number is required to register a customer.');
  }

  const customer = await resolveOrCreateCustomer({
    businessId: params.businessId,
    phoneNumber: params.phoneNumber,
    ...(params.customerName ? { customerName: params.customerName } : {})
  });

  const trimmedName = params.customerName?.trim();
  if (trimmedName && customer['name'] !== trimmedName) {
    customer.set('name', trimmedName);
    await customer.save();
  }

  return {
    customerId: customer._id,
    customerName: customer['name'],
    customerPhoneNumber: customer['phoneNumber']
  };
};
