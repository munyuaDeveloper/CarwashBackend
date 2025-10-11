import jwt from 'jsonwebtoken';
import { IJWTPayload } from '../types';

const signToken = (id: string): string => {
  const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';
  const JWT_EXPIRES_IN = process.env['JWT_EXPIRES_IN'] || '90d';

  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  } as jwt.SignOptions);
};

const createSendToken = (user: any, statusCode: number, res: any) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + (process.env['JWT_COOKIE_EXPIRES_IN'] as any) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true
  };

  if (process.env['NODE_ENV'] === 'production') {
    (cookieOptions as any).secure = true;
  }

  res.cookie('jwt', token, cookieOptions);

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

const verifyToken = (token: string): IJWTPayload => {
  const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';
  return jwt.verify(token, JWT_SECRET) as IJWTPayload;
};

export { signToken, createSendToken, verifyToken };
