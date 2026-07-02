import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const requireAdmin = asyncHandler(async (req, _res, next) => {
  if (!req.user) throw ApiError.unauthorized();
  if (req.user.role !== 'admin') throw ApiError.forbidden('Admin access required');
  next();
});
