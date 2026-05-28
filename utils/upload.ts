import multer from 'multer';
import { Request } from 'express';
import AppError from './appError';

const multerStorage = multer.memoryStorage();

const multerFilter: multer.Options['fileFilter'] = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
    return;
  }

  cb(new AppError('Please upload only image files.', 400));
};

export const uploadProfilePhoto = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('photo');
