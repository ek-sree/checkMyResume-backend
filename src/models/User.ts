import { Schema, model, type Model, type Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { getPlan, type Plan } from '../config/plans';

export type AuthProvider = 'local' | 'google';

export interface IUser {
  name: string;
  email: string;
  passwordHash?: string | null;
  authProvider: AuthProvider;
  googleId: string | null;
  avatar: string | null;
  tokenVersion: number;
  emailVerified: boolean;
  pendingEmail: string | null;
  role: 'user' | 'admin';
  blocked: boolean;
  tokensUsed: number;
  aiRuns: number;

  plan: Plan;
  credits: number;
  creditsResetAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUser {
  id: Types.ObjectId;
  name: string;
  email: string;
  avatar: string | null;
  emailVerified: boolean;
  authProvider: AuthProvider;
  role: 'user' | 'admin';
  plan: Plan;
  credits: number;
  subscriptionStatus: string | null;
  createdAt: Date;
}

export interface IUserMethods {
  setPassword(plain: string): Promise<void>;
  verifyPassword(plain: string): Promise<boolean>;
  canRunAI(): boolean;
  toPublicJSON(): PublicUser;
}

type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      select: false,
      default: null,
      required: function (this: IUser) {
        return this.authProvider === 'local';
      },
    },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    googleId: { type: String, default: null, index: true },
    avatar: { type: String, default: null },
    tokenVersion: { type: Number, default: 0 },
    emailVerified: { type: Boolean, default: false },
    pendingEmail: { type: String, default: null },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    blocked: { type: Boolean, default: false },
    tokensUsed: { type: Number, default: 0 },
    aiRuns: { type: Number, default: 0 },

    plan: { type: String, enum: ['free', 'starter', 'pro', 'premium'], default: 'free' },
    credits: { type: Number, default: env.freeCredits },
    creditsResetAt: { type: Date, default: null },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    subscriptionStatus: { type: String, default: null },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain: string): Promise<void> {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(plain: string): Promise<boolean> {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.canRunAI = function canRunAI(): boolean {
  return getPlan(this.plan).unlimitedCredits || this.credits > 0;
};

userSchema.methods.toPublicJSON = function toPublicJSON(): PublicUser {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    avatar: this.avatar,
    emailVerified: this.emailVerified,
    authProvider: this.authProvider,
    role: this.role,
    plan: this.plan,
    credits: this.credits,
    subscriptionStatus: this.subscriptionStatus,
    createdAt: this.createdAt,
  };
};

export const User = model<IUser, UserModel>('User', userSchema);
