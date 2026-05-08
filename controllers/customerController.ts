import { NextFunction, Response } from 'express';
import { IRequestWithUser } from '../types';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import Customer from '../models/customerModel';
import Vehicle from '../models/vehicleModel';
import APIFeatures from '../utils/apiFeatures';

const customerController = {
  createCustomer: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = req.user?.business ? req.user.business.toString() : null;
    if (!businessId) {
      return next(new AppError('Business context is required', 403));
    }

    const { name, phoneNumber, smsConsent, active } = req.body as {
      name?: string;
      phoneNumber?: string;
      smsConsent?: boolean;
      active?: boolean;
    };

    if (!name?.trim() || !phoneNumber?.trim()) {
      return next(new AppError('name and phoneNumber are required', 400));
    }

    const customer = await Customer.create({
      business: businessId,
      name: name.trim(),
      phoneNumber: phoneNumber.trim(),
      ...(typeof smsConsent === 'boolean' ? { smsConsent } : {}),
      ...(typeof active === 'boolean' ? { active } : {})
    });

    res.status(201).json({
      status: 'success',
      data: { customer }
    });
  }),

  getAllCustomers: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = req.user?.business ? req.user.business.toString() : null;
    if (!businessId) {
      return next(new AppError('Business context is required', 403));
    }

    const filter: Record<string, unknown> = { business: businessId };
    const { search } = req.query;
    if (typeof search === 'string' && search.trim().length > 0) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      filter['$or'] = [
        { name: { $regex: searchRegex } },
        { phoneNumber: { $regex: searchRegex } },
        { vehiclePlate: { $regex: searchRegex } }
      ];
    }

    const features = new APIFeatures(Customer.find(filter), req.query).filter().sort().limitFields();
    await features.paginate();
    const customers = await features.query;
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 100);

    res.status(200).json({
      status: 'success',
      results: customers.length,
      total: features.totalCount ?? customers.length,
      page,
      limit,
      data: { customers }
    });
  }),

  getCustomer: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const customer = await Customer.findById(req.params['id']);
    if (!customer) {
      return next(new AppError('Customer not found', 404));
    }
    const businessId = req.user?.business ? req.user.business.toString() : null;
    if (!businessId || customer['business'].toString() !== businessId) {
      return next(new AppError('You do not have permission to access this customer', 403));
    }
    res.status(200).json({
      status: 'success',
      data: { customer }
    });
  }),

  updateCustomer: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const customer = await Customer.findById(req.params['id']);
    if (!customer) {
      return next(new AppError('Customer not found', 404));
    }
    const businessId = req.user?.business ? req.user.business.toString() : null;
    if (!businessId || customer['business'].toString() !== businessId) {
      return next(new AppError('You do not have permission to update this customer', 403));
    }

    const { name, phoneNumber, vehiclePlate, smsConsent, active } = req.body as {
      name?: string;
      phoneNumber?: string;
      vehiclePlate?: string;
      smsConsent?: boolean;
      active?: boolean;
    };

    const updated = await Customer.findByIdAndUpdate(
      req.params['id'],
      {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(phoneNumber !== undefined ? { phoneNumber: phoneNumber.trim() } : {}),
        ...(vehiclePlate !== undefined ? { vehiclePlate: vehiclePlate.trim().toUpperCase() } : {}),
        ...(typeof smsConsent === 'boolean' ? { smsConsent } : {}),
        ...(typeof active === 'boolean' ? { active } : {})
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      status: 'success',
      data: { customer: updated }
    });
  }),

  deleteCustomer: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const customer = await Customer.findById(req.params['id']);
    if (!customer) {
      return next(new AppError('Customer not found', 404));
    }
    const businessId = req.user?.business ? req.user.business.toString() : null;
    if (!businessId || customer['business'].toString() !== businessId) {
      return next(new AppError('You do not have permission to delete this customer', 403));
    }

    const vehicleCount = await Vehicle.countDocuments({ customer: req.params['id'] });
    if (vehicleCount > 0) {
      return next(
        new AppError(
          'Cannot delete this customer while vehicles are linked. Remove or reassign those vehicles first.',
          400
        )
      );
    }

    await Customer.findByIdAndDelete(req.params['id']);
    res.status(204).json({
      status: 'success',
      data: null
    });
  })
};

export default customerController;
