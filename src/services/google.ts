import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

const client = env.google.enabled ? new OAuth2Client(env.google.clientId) : null;

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatar?: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!client) throw ApiError.badRequest('Google sign-in is not configured on this server.');

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.google.clientId });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized('Invalid Google token');
  }

  if (!payload?.email || !payload.sub) {
    throw ApiError.unauthorized('Google token missing required fields');
  }
  if (payload.email_verified === false) {
    throw ApiError.unauthorized('Your Google email is not verified');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0]!,
    avatar: payload.picture,
  };
}
