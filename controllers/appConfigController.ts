import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import AppConfig from '../models/appConfigModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';

const appConfigController = {
  // Get application configuration (admin only)
  getAppConfig: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can access application configuration', 403));
    }

    const config = await AppConfig.getOrCreateConfig();

    res.status(200).json({
      status: 'success',
      data: {
        config
      }
    });
  }),

  // Update application configuration (admin only)
  // Accepts any config field updates for flexibility
  updateAppConfig: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('Only admins can update application configuration', 403));
    }

    const updates = req.body;
    
    // Validate that at least one field is provided
    if (!updates || Object.keys(updates).length === 0) {
      return next(new AppError('At least one config field must be provided for update', 400));
    }

    // Validate autoResetEnabled if provided (must be boolean)
    if ('autoResetEnabled' in updates && typeof updates.autoResetEnabled !== 'boolean') {
      return next(new AppError('autoResetEnabled must be a boolean value', 400));
    }

    // Prepare update object
    const updateData: Record<string, any> = { ...updates };
    
    // If autoResetEnabled is being updated, also update lastResetBy
    if ('autoResetEnabled' in updates) {
      updateData['lastResetBy'] = req.user.name || req.user.email;
    }

    // Note: lastResetDate is only updated by the cron job, not when toggling
    // Remove it from updates if present to prevent manual modification
    delete updateData['lastResetDate'];

    // Update config with any provided fields
    const config = await AppConfig.updateConfig(updateData);

    // Build success message
    const updatedFields = Object.keys(updates).filter(key => key !== 'lastResetDate');
    const message = updatedFields.length === 1 && 'autoResetEnabled' in updates
      ? `Auto wallet reset ${updates.autoResetEnabled ? 'enabled' : 'disabled'} successfully`
      : `Configuration updated successfully. Updated fields: ${updatedFields.join(', ')}`;

    res.status(200).json({
      status: 'success',
      message,
      data: {
        config
      }
    });
  })
};

export default appConfigController;
