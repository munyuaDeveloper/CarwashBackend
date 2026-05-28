import crypto from 'crypto';

/** Generates a random temporary password for new accounts. */
export const generateDefaultPassword = (): string =>
  crypto.randomBytes(9).toString('base64url').slice(0, 12);
