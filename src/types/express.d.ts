import type { HydratedDocument } from 'mongoose';
import type { IUser, IUserMethods } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      // Populated by requireAuth middleware.
      user?: HydratedDocument<IUser, IUserMethods>;
    }
  }
}

export {};
