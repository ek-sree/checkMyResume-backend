import bcrypt from 'bcryptjs';
import { Otp, type OtpPurpose } from '../models/Otp';

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

export async function issueOtp(email: string, purpose: OtpPurpose, payload?: string): Promise<string> {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const codeHash = await bcrypt.hash(code, 10);
  await Otp.findOneAndUpdate(
    { email: email.toLowerCase(), purpose },
    { codeHash, payload: payload ?? null, attempts: 0, expiresAt: new Date(Date.now() + TTL_MS) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return code;
}

export async function checkOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): Promise<{ ok: boolean; payload?: string | null }> {
  const otp = await Otp.findOne({ email: email.toLowerCase(), purpose });
  if (!otp) return { ok: false };

  if (otp.expiresAt.getTime() < Date.now() || otp.attempts >= MAX_ATTEMPTS) {
    await otp.deleteOne();
    return { ok: false };
  }

  const match = await bcrypt.compare(code, otp.codeHash);
  if (!match) {
    otp.attempts += 1;
    await otp.save();
    return { ok: false };
  }

  const payload = otp.payload;
  await otp.deleteOne();
  return { ok: true, payload };
}
