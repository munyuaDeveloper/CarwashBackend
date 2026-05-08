import { NextFunction, Response } from 'express';
import mongoose from 'mongoose';
import { IRequestWithUser } from '../types';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import Vehicle from '../models/vehicleModel';
import Customer from '../models/customerModel';

const normalizePlate = (plate: string): string => plate.trim().toUpperCase();

const pickFirstQueryString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return typeof value === 'string' ? value : undefined;
};

const vehicleController = {
  getAllVehicles: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = req.user?.business ? req.user.business.toString() : null;
    if (!businessId) {
      return next(new AppError('Business context is required', 403));
    }

    const filter: Record<string, unknown> = {
      business: new mongoose.Types.ObjectId(businessId)
    };

    const customerIdRaw = pickFirstQueryString(req.query['customerId']);
    if (customerIdRaw !== undefined && customerIdRaw.trim() !== '') {
      if (!/^[0-9a-fA-F]{24}$/.test(customerIdRaw.trim())) {
        return next(new AppError('Invalid customerId query parameter', 400));
      }
      const customerOid = new mongoose.Types.ObjectId(customerIdRaw.trim());
      const linkedCustomer = await Customer.findById(customerOid);
      if (!linkedCustomer || linkedCustomer['business'].toString() !== businessId) {
        return next(new AppError('Customer not found in your business', 404));
      }
      filter['customer'] = customerOid;
    }

    const searchRaw = pickFirstQueryString(req.query['search']);
    if (searchRaw !== undefined && searchRaw.trim().length > 0) {
      const escaped = searchRaw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter['plate'] = { $regex: escaped, $options: 'i' };
    }

    const sortRaw = pickFirstQueryString(req.query['sort']);
    const sortBy =
      sortRaw !== undefined && sortRaw.trim().length > 0 ? sortRaw.split(',').join(' ') : '-createdAt';

    const page = Math.max(1, Number(req.query['page'] ?? 1) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 100) || 100));
    const skip = (page - 1) * limit;

    const totalCount = await Vehicle.countDocuments(filter);

    const vehicles = await Vehicle.find(filter)
      .populate('customer', 'name phoneNumber smsConsent active vehiclePlate')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .select('-__v');

    res.status(200).json({
      status: 'success',
      results: vehicles.length,
      total: totalCount,
      page,
      limit,
      data: { vehicles }
    });
  }),

  createVehicle: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = req.user?.business ? req.user.business.toString() : null;
    if (!businessId) {
      return next(new AppError('Business context is required', 403));
    }

    const { customerId, plate, vehicleType } = req.body as {
      customerId?: string;
      plate?: string;
      vehicleType?: string;
    };

    if (!customerId?.trim() || !plate?.trim()) {
      return next(new AppError('customerId and plate are required', 400));
    }

    const customer = await Customer.findById(customerId.trim());
    if (!customer || customer['business'].toString() !== businessId) {
      return next(new AppError('Customer not found in your business', 404));
    }

    try {
      const vehicle = await Vehicle.create({
        business: businessId,
        customer: customer._id,
        plate: normalizePlate(plate),
        ...(vehicleType !== undefined ? { vehicleType: vehicleType.trim() } : {})
      });
      await vehicle.populate('customer', 'name phoneNumber smsConsent active vehiclePlate');
      res.status(201).json({
        status: 'success',
        data: { vehicle }
      });
    } catch (createError: unknown) {
      if (
        createError &&
        typeof createError === 'object' &&
        'code' in createError &&
        (createError as { code?: number }).code === 11000
      ) {
        return next(new AppError('A vehicle with this plate already exists for your business', 409));
      }
      throw createError;
    }
  }),

  createVehicleWithCustomer: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = req.user?.business ? req.user.business.toString() : null;
    if (!businessId) {
      return next(new AppError('Business context is required', 403));
    }

    const {
      plate,
      vehicleType,
      customer: customerPayload
    } = req.body as {
      plate?: string;
      vehicleType?: string;
      customer?: {
        name?: string;
        phoneNumber?: string;
        smsConsent?: boolean;
        active?: boolean;
      };
    };

    if (!plate?.trim()) {
      return next(new AppError('plate is required', 400));
    }
    if (
      !customerPayload?.name?.trim() ||
      !customerPayload?.phoneNumber?.trim()
    ) {
      return next(new AppError('customer.name and customer.phoneNumber are required', 400));
    }

    const normalizedPlate = normalizePlate(plate);

    try {
      const customer = await Customer.create({
        business: businessId,
        name: customerPayload.name.trim(),
        phoneNumber: customerPayload.phoneNumber.trim(),
        ...(typeof customerPayload.smsConsent === 'boolean' ? { smsConsent: customerPayload.smsConsent } : {}),
        ...(typeof customerPayload.active === 'boolean' ? { active: customerPayload.active } : {})
      });

      const vehicle = await Vehicle.create({
        business: businessId,
        customer: customer._id,
        plate: normalizedPlate,
        ...(vehicleType !== undefined ? { vehicleType: vehicleType.trim() } : {})
      });
      await vehicle.populate('customer', 'name phoneNumber smsConsent active vehiclePlate');
      res.status(201).json({
        status: 'success',
        data: { vehicle, customer }
      });
    } catch (createError: unknown) {
      if (
        createError &&
        typeof createError === 'object' &&
        'code' in createError &&
        (createError as { code?: number }).code === 11000
      ) {
        return next(new AppError('A vehicle with this plate already exists for your business', 409));
      }
      throw createError;
    }
  }),

  updateVehicle: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = req.user?.business ? req.user.business.toString() : null;
    if (!businessId) {
      return next(new AppError('Business context is required', 403));
    }

    const vehicleId = req.params['id'];
    if (!vehicleId || !mongoose.Types.ObjectId.isValid(vehicleId)) {
      return next(new AppError('Invalid vehicle id', 400));
    }

    const vehicle = await Vehicle.findOne({
      _id: new mongoose.Types.ObjectId(vehicleId),
      business: new mongoose.Types.ObjectId(businessId)
    });

    if (!vehicle) {
      return next(new AppError('Vehicle not found', 404));
    }

    const { plate, vehicleType, customerId } = req.body as {
      plate?: string;
      vehicleType?: string;
      customerId?: string;
    };

    if (customerId !== undefined) {
      const trimmedCustomerId = typeof customerId === 'string' ? customerId.trim() : '';
      if (!trimmedCustomerId || !mongoose.Types.ObjectId.isValid(trimmedCustomerId)) {
        return next(new AppError('Valid customerId is required when updating customer', 400));
      }
      const customer = await Customer.findById(trimmedCustomerId);
      if (!customer || customer['business'].toString() !== businessId) {
        return next(new AppError('Customer not found in your business', 404));
      }
      vehicle.set('customer', customer._id);
    }

    if (plate !== undefined) {
      const trimmed = typeof plate === 'string' ? plate.trim() : '';
      if (!trimmed) {
        return next(new AppError('plate cannot be empty', 400));
      }
      vehicle.set('plate', normalizePlate(trimmed));
    }

    if (vehicleType !== undefined) {
      vehicle.set('vehicleType', typeof vehicleType === 'string' ? vehicleType.trim() : '');
    }

    try {
      await vehicle.save();
      await vehicle.populate('customer', 'name phoneNumber smsConsent active vehiclePlate');
      res.status(200).json({
        status: 'success',
        data: { vehicle }
      });
    } catch (saveError: unknown) {
      if (
        saveError &&
        typeof saveError === 'object' &&
        'code' in saveError &&
        (saveError as { code?: number }).code === 11000
      ) {
        return next(new AppError('A vehicle with this plate already exists for your business', 409));
      }
      throw saveError;
    }
  }),

  deleteVehicle: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = req.user?.business ? req.user.business.toString() : null;
    if (!businessId) {
      return next(new AppError('Business context is required', 403));
    }

    const vehicleId = req.params['id'];
    if (!vehicleId || !mongoose.Types.ObjectId.isValid(vehicleId)) {
      return next(new AppError('Invalid vehicle id', 400));
    }

    const result = await Vehicle.deleteOne({
      _id: new mongoose.Types.ObjectId(vehicleId),
      business: new mongoose.Types.ObjectId(businessId)
    });

    if (result.deletedCount === 0) {
      return next(new AppError('Vehicle not found', 404));
    }

    res.status(200).json({ status: 'success', message: 'Vehicle removed' });
  })
};

export default vehicleController;
