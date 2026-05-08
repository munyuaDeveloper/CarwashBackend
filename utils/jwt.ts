import jwt from 'jsonwebtoken';
import { IJWTPayload } from '../types';
import User from '../models/userModel';

type TokenPayload = {
  id: string;
  businessId?: string | null;
};

const signToken = ({ id, businessId }: TokenPayload): string => {
  const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';
  const JWT_EXPIRES_IN = process.env['JWT_EXPIRES_IN'] || '90d';

  const payload: TokenPayload = { id };
  if (businessId !== undefined) {
    payload.businessId = businessId;
  }

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  } as jwt.SignOptions);
};

const createSendToken = async (user: any, statusCode: number, res: any): Promise<void> => {
  const userBusinessId =
    user?.role !== 'system_admin'
      ? (typeof user?.business === 'object' && user?.business?._id
          ? user.business._id.toString()
          : user?.business?.toString?.() || null)
      : undefined;

  const token = signToken({
    id: user._id.toString(),
    businessId: userBusinessId
  });
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

  const userWithBusiness = await User.findById(user._id)
    .select('-password')
    .populate('business', 'name');

  const responseUser = userWithBusiness || user;
  responseUser.password = undefined;
  const responseUserObj = typeof responseUser.toObject === 'function' ? responseUser.toObject() : responseUser;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user: responseUserObj
    }
  });
};

const verifyToken = (token: string): IJWTPayload => {
  const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';
  return jwt.verify(token, JWT_SECRET) as IJWTPayload;
};

export { signToken, createSendToken, verifyToken };
