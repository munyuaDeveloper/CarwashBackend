import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export const isMpesaEncryptionKeyConfigured = (): boolean => {
  const raw = process.env['MPESA_ENCRYPTION_KEY']?.trim();
  const secret = raw?.replace(/^["']|["']$/g, '') ?? '';
  return Boolean(secret);
};

const deriveKey = (): Buffer => {
  if (!isMpesaEncryptionKeyConfigured()) {
    throw new Error('MPESA_ENCRYPTION_KEY is not configured');
  }
  const raw = process.env['MPESA_ENCRYPTION_KEY']!.trim();
  const secret = raw.replace(/^["']|["']$/g, '');
  return crypto.scryptSync(secret, 'washflow-mpesa-v1', 32);
};

export const encryptMpesaSecret = (plaintext: string): string => {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};

export const decryptMpesaSecret = (ciphertext: string): string => {
  try {
    const key = deriveKey();
    const buffer = Buffer.from(ciphertext, 'base64');
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new Error(
      'Stored M-PESA secrets could not be decrypted. Re-enter passkey and consumer secret in M-PESA settings (encryption key may have changed).'
    );
  }
};

export const maskSecret = (value?: string | null): string | null => {
  if (!value || value.length < 4) return value ? '****' : null;
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 12))}${value.slice(-2)}`;
};
