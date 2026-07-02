import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import { ApiError } from '../utils/ApiError';

/**
 * Rejects malformed Mongo ObjectId route params with a clean 404 instead of
 * letting an invalid id reach the database and throw a CastError (which would
 * surface as a 500 and leak internals).
 */
export const validateId =
  (...params: string[]): RequestHandler =>
  (req, _res, next) => {
    for (const name of params) {
      const value = req.params[name];
      if (value && !isValidObjectId(value)) {
        return next(ApiError.notFound('Resource not found'));
      }
    }
    next();
  };
