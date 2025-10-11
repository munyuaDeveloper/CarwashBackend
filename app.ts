import express, { Application, Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import cors from 'cors';

import AppError from './utils/appError';
import globalErrorHandler from './controllers/errorController';
import userRouter from './routes/userRoutes';
import bookingRouter from './routes/bookingRoutes';

// Extend Request interface to include custom properties
declare global {
  namespace Express {
    interface Request {
      requestTime?: string;
    }
  }
}

// Start express app
const app: Application = express();

// 1) GLOBAL MIDDLEWARES
// Security HTTP headers
app.use(helmet());

// Implement CORS
app.use(cors());

app.options('*', cors());

// Development logging
if (process.env['NODE_ENV'] === 'development') {
  app.use(morgan('dev'));
}

// Limit requests from same API
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!'
});
app.use('/api', limiter);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

app.use(compression());

// Test middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.requestTime = new Date().toISOString();
  // console.log(req.cookies);
  next();
});

// 3) ROUTES
app.use('/api/v1/users', userRouter);
app.use('/api/v1/bookings', bookingRouter);

app.all('*', (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

export default app;
