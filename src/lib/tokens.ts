import crypto from 'crypto';

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const INVITE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;
