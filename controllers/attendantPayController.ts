import { NextFunction, Response } from 'express';
import { IRequestWithUser } from '../types';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import Business from '../models/businessModel';
import { userHasAnyRole } from '../utils/userRoles';
import {
  DEFAULT_ATTENDANT_PAY_SETTINGS,
  normalizeAttendantPaySettings,
  splitBookingAmount,
  type AttendantPayMode
} from '../utils/attendantPayMath';

const getBusinessContext = (req: IRequestWithUser): string | null =>
  userHasAnyRole(req.user, ['system_admin', 'admin'])
    ? (typeof req.query['businessId'] === 'string'
        ? req.query['businessId']
        : typeof req.params['businessId'] === 'string'
          ? req.params['businessId']
          : null)
    : (req.user?.business ? req.user.business.toString() : null);

const attendantPayController = {
  getSettings: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = getBusinessContext(req);
    if (!businessId) {
      return next(new AppError('Business context is required', 400));
    }

    const business = await Business.findById(businessId).select('name attendantPaySettings');
    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    const attendantPaySettings = normalizeAttendantPaySettings(
      (business['attendantPaySettings'] as Partial<typeof DEFAULT_ATTENDANT_PAY_SETTINGS> | undefined) ?? null
    );
    const preview = splitBookingAmount(250, attendantPaySettings);

    res.status(200).json({
      status: 'success',
      data: {
        businessId,
        businessName: business['name'],
        attendantPaySettings,
        preview: {
          sampleAmountKes: 250,
          attendantShareKes: preview.attendantShare,
          companyShareKes: preview.companyShare
        }
      }
    });
  }),

  updateSettings: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const businessId = getBusinessContext(req);
    if (!businessId) {
      return next(new AppError('Business context is required', 400));
    }

    const { mode, attendantPercent, salaryAmountKes } = req.body as {
      mode?: AttendantPayMode;
      attendantPercent?: number;
      salaryAmountKes?: number;
    };

    if (mode !== undefined && !['percentage', 'daily_salary', 'monthly_salary'].includes(mode)) {
      return next(new AppError('mode must be percentage, daily_salary, or monthly_salary', 400));
    }
    if (
      attendantPercent !== undefined &&
      (!Number.isFinite(Number(attendantPercent)) || Number(attendantPercent) < 0 || Number(attendantPercent) > 100)
    ) {
      return next(new AppError('attendantPercent must be between 0 and 100', 400));
    }
    if (salaryAmountKes !== undefined && (!Number.isFinite(Number(salaryAmountKes)) || Number(salaryAmountKes) < 0)) {
      return next(new AppError('salaryAmountKes must be 0 or greater', 400));
    }

    const current = await Business.findById(businessId).select('attendantPaySettings name');
    if (!current) {
      return next(new AppError('Business not found', 404));
    }

    const nextSettings = normalizeAttendantPaySettings({
      ...normalizeAttendantPaySettings(
        (current['attendantPaySettings'] as Partial<typeof DEFAULT_ATTENDANT_PAY_SETTINGS> | undefined) ?? null
      ),
      ...(mode !== undefined ? { mode } : {}),
      ...(attendantPercent !== undefined ? { attendantPercent: Number(attendantPercent) } : {}),
      ...(salaryAmountKes !== undefined ? { salaryAmountKes: Number(salaryAmountKes) } : {})
    });

    const business = await Business.findByIdAndUpdate(
      businessId,
      { attendantPaySettings: nextSettings },
      { new: true }
    ).select('name attendantPaySettings');

    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    const attendantPaySettings = normalizeAttendantPaySettings(
      (business['attendantPaySettings'] as Partial<typeof DEFAULT_ATTENDANT_PAY_SETTINGS> | undefined) ?? null
    );
    const preview = splitBookingAmount(250, attendantPaySettings);

    res.status(200).json({
      status: 'success',
      message: 'Attendant pay settings updated',
      data: {
        businessId,
        businessName: business['name'],
        attendantPaySettings,
        preview: {
          sampleAmountKes: 250,
          attendantShareKes: preview.attendantShare,
          companyShareKes: preview.companyShare
        }
      }
    });
  })
};

export default attendantPayController;
