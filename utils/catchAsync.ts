import { Request, Response, NextFunction } from 'express';
import { AsyncFunction } from '../types';

const catchAsync = (fn: AsyncFunction) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

export default catchAsync;
