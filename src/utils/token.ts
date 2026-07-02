import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type TokenType = 'access' | 'refresh';

export interface TokenPayload {
  sub: string;
  tv: number; 
  type: TokenType;
}

interface UserLike {
  _id: unknown;
  tokenVersion: number;
}

export function signAccessToken(user: UserLike): string {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion, type: 'access' }, env.jwtSecret, {
    expiresIn: env.accessTtl,
  } as jwt.SignOptions);
}

export function signRefreshToken(user: UserLike): string {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion, type: 'refresh' }, env.jwtSecret, {
    expiresIn: env.refreshTtl,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
}
