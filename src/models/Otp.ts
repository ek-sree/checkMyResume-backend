import { Schema, model } from 'mongoose';

export type OtpPurpose = 'verify' | 'reset' | 'change-email';


export interface IOtp {
  email: string;
  purpose: OtpPurpose;
  codeHash: string;
  payload: string | null;
  attempts: number;
  expiresAt: Date;
}

const otpSchema = new Schema<IOtp>({
  email: { type: String, required: true, lowercase: true, trim: true },
  purpose: { type: String, enum: ['verify', 'reset', 'change-email'], required: true },
  codeHash: { type: String, required: true },
  payload: { type: String, default: null },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

otpSchema.index({ email: 1, purpose: 1 }, { unique: true });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = model<IOtp>('Otp', otpSchema);
