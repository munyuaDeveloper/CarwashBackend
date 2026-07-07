import { normalizeKenyanMobile } from './textSmsService';

/** KCD 777X and kcd77x → KCD777X */
export const normalizePlate = (raw: string): string =>
  raw.trim().toUpperCase().replace(/\s+/g, '');

/** 0712…, +254712…, 254712… → single canonical form (254XXXXXXXXX when Kenyan). */
export const normalizePhoneForStorage = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const kenyan = normalizeKenyanMobile(trimmed);
  if (kenyan) return kenyan;

  const digits = trimmed.replace(/\D/g, '');
  return digits || trimmed;
};
