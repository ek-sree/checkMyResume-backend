import { verifyToken } from '../utils/token';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';


export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = req.cookies?.at || bearer;

  if (!token) throw ApiError.unauthorized('Not authenticated');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw ApiError.unauthorized('Session expired');
  }

  if (payload.type !== 'access') throw ApiError.unauthorized('Invalid token');

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (user.tokenVersion !== payload.tv) throw ApiError.unauthorized('Session revoked');
  if (user.blocked) throw ApiError.forbidden('Your account has been blocked.');

  req.user = user;
  next();
});
