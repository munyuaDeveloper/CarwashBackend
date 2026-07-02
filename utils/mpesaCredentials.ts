import {
  decryptMpesaSecret,
  encryptMpesaSecret,
  isMpesaEncryptionKeyConfigured,
  maskSecret
} from './mpesaEncryption';
import type { MpesaBusinessCredentials, MpesaEnvironment, MpesaShortcodeType } from './mpesaService';

export type MpesaOAuthCredentials = {
  environment: MpesaEnvironment;
  consumerKey: string;
  consumerSecret: string;
};

export type StoredMpesaSettings = {
  enabled?: boolean;
  environment?: MpesaEnvironment;
  shortcodeType?: MpesaShortcodeType;
  businessShortCode?: string;
  passkeyEncrypted?: string;
  consumerKey?: string;
  consumerSecretEncrypted?: string;
  accountReferencePrefix?: string;
};

export type PublicMpesaSettings = {
  enabled: boolean;
  environment: MpesaEnvironment;
  shortcodeType: MpesaShortcodeType | null;
  businessShortCode: string | null;
  consumerKey: string | null;
  hasPasskey: boolean;
  hasConsumerSecret: boolean;
  accountReferencePrefix: string;
  configured: boolean;
};

export type MpesaSettingsInput = {
  enabled?: boolean;
  environment?: MpesaEnvironment;
  shortcodeType?: MpesaShortcodeType;
  businessShortCode?: string;
  passkey?: string;
  consumerKey?: string;
  consumerSecret?: string;
  accountReferencePrefix?: string;
};

export const toPublicMpesaSettings = (settings?: StoredMpesaSettings | null): PublicMpesaSettings => {
  const environment = settings?.environment === 'production' ? 'production' : 'sandbox';
  const hasPasskey = Boolean(settings?.passkeyEncrypted);
  const hasConsumerSecret = Boolean(settings?.consumerSecretEncrypted);
  const configured = Boolean(
    settings?.businessShortCode &&
      settings?.consumerKey &&
      hasPasskey &&
      hasConsumerSecret &&
      settings?.shortcodeType
  );

  return {
    enabled: Boolean(settings?.enabled),
    environment,
    shortcodeType: settings?.shortcodeType ?? null,
    businessShortCode: settings?.businessShortCode ?? null,
    consumerKey: settings?.consumerKey ? maskSecret(settings.consumerKey) : null,
    hasPasskey,
    hasConsumerSecret,
    accountReferencePrefix: settings?.accountReferencePrefix?.trim() || 'WF',
    configured
  };
};

export const buildMpesaSettingsUpdate = (
  current: StoredMpesaSettings | undefined,
  input: MpesaSettingsInput
): Record<string, unknown> => {
  const update: Record<string, unknown> = {};

  if (input.enabled !== undefined) {
    update['mpesaSettings.enabled'] = input.enabled;
  }
  if (input.environment !== undefined) {
    update['mpesaSettings.environment'] = input.environment;
  }
  if (input.shortcodeType !== undefined) {
    update['mpesaSettings.shortcodeType'] = input.shortcodeType;
  }
  if (input.businessShortCode !== undefined) {
    update['mpesaSettings.businessShortCode'] = input.businessShortCode.trim();
  }
  if (input.consumerKey !== undefined) {
    update['mpesaSettings.consumerKey'] = input.consumerKey.trim();
  }
  if (input.accountReferencePrefix !== undefined) {
    update['mpesaSettings.accountReferencePrefix'] = input.accountReferencePrefix.trim() || 'WF';
  }
  if (input.passkey !== undefined && input.passkey.trim()) {
    update['mpesaSettings.passkeyEncrypted'] = encryptMpesaSecret(input.passkey.trim());
  }
  if (input.consumerSecret !== undefined && input.consumerSecret.trim()) {
    update['mpesaSettings.consumerSecretEncrypted'] = encryptMpesaSecret(input.consumerSecret.trim());
  }

  if (input.enabled === true) {
    const nextSettings = {
      enabled: true as const,
      environment: input.environment ?? current?.environment ?? 'sandbox',
      shortcodeType: input.shortcodeType ?? current?.shortcodeType,
      businessShortCode: input.businessShortCode?.trim() ?? current?.businessShortCode,
      consumerKey: input.consumerKey?.trim() ?? current?.consumerKey,
      passkeyEncrypted:
        input.passkey?.trim() !== undefined && input.passkey.trim()
          ? encryptMpesaSecret(input.passkey.trim())
          : current?.passkeyEncrypted,
      consumerSecretEncrypted:
        input.consumerSecret?.trim() !== undefined && input.consumerSecret.trim()
          ? encryptMpesaSecret(input.consumerSecret.trim())
          : current?.consumerSecretEncrypted
    };

    if (
      !nextSettings.businessShortCode ||
      !nextSettings.consumerKey ||
      !nextSettings.passkeyEncrypted ||
      !nextSettings.consumerSecretEncrypted ||
      !nextSettings.shortcodeType
    ) {
      throw new Error(
        'M-PESA cannot be enabled until shortcode type, business shortcode, consumer key, passkey, and consumer secret are configured'
      );
    }
  }

  return update;
};

export const tryDecryptMpesaSecret = (ciphertext?: string | null): string | null => {
  if (!ciphertext) return null;
  try {
    return decryptMpesaSecret(ciphertext).trim();
  } catch {
    return null;
  }
};

export const resolveBusinessMpesaOAuthCredentials = (
  settings: StoredMpesaSettings | null | undefined,
  input?: MpesaSettingsInput
): MpesaOAuthCredentials => {
  const environment =
    input?.environment ?? (settings?.environment === 'production' ? 'production' : 'sandbox');
  const consumerKey = (input?.consumerKey ?? settings?.consumerKey)?.trim();

  let consumerSecret = input?.consumerSecret?.trim() ?? '';
  if (!consumerSecret) {
    consumerSecret = tryDecryptMpesaSecret(settings?.consumerSecretEncrypted) ?? '';
  }

  if (!consumerKey || !consumerSecret) {
    const needsReEntry = Boolean(settings?.consumerSecretEncrypted) && !input?.consumerSecret?.trim();
    throw new Error(
      needsReEntry
        ? 'Re-enter the consumer secret in the form to test connection (saved secrets need to be re-saved after an encryption key change).'
        : 'Consumer key and consumer secret are required to test connection.'
    );
  }

  return {
    environment,
    consumerKey,
    consumerSecret
  };
};

export const resolveBusinessMpesaCredentials = (
  settings?: StoredMpesaSettings | null
): MpesaBusinessCredentials => {
  if (!settings?.enabled) {
    throw new Error('M-PESA is not enabled for this business');
  }

  if (
    !settings.businessShortCode ||
    !settings.consumerKey ||
    !settings.passkeyEncrypted ||
    !settings.consumerSecretEncrypted ||
    !settings.shortcodeType
  ) {
    throw new Error('M-PESA credentials are incomplete for this business');
  }

  if (!isMpesaEncryptionKeyConfigured()) {
    throw new Error(
      'MPESA_ENCRYPTION_KEY is not set on the server. Add it in your deployment environment (e.g. Vercel → Settings → Environment Variables) using the same value that was used when M-PESA credentials were saved.'
    );
  }

  const passkey = tryDecryptMpesaSecret(settings.passkeyEncrypted);
  const consumerSecret = tryDecryptMpesaSecret(settings.consumerSecretEncrypted);

  if (!passkey || !consumerSecret) {
    throw new Error(
      'Stored M-PESA secrets could not be decrypted. The server MPESA_ENCRYPTION_KEY likely does not match the key used when credentials were saved locally. Either set the same key in production, or re-enter passkey and consumer secret in M-PESA settings and save again.'
    );
  }

  return {
    environment: settings.environment === 'production' ? 'production' : 'sandbox',
    shortcodeType: settings.shortcodeType,
    businessShortCode: settings.businessShortCode.trim(),
    passkey,
    consumerKey: settings.consumerKey.trim(),
    consumerSecret,
    accountReferencePrefix: settings.accountReferencePrefix?.trim() || 'WF'
  };
};

export const resolveBusinessMpesaCredentialsForTest = (
  settings: StoredMpesaSettings | null | undefined,
  input?: MpesaSettingsInput
): MpesaBusinessCredentials => {
  const environment =
    input?.environment ?? (settings?.environment === 'production' ? 'production' : 'sandbox');
  const shortcodeType = input?.shortcodeType ?? settings?.shortcodeType;

  if (!shortcodeType) {
    throw new Error('Shortcode type is required');
  }

  const businessShortCode = (input?.businessShortCode ?? settings?.businessShortCode)?.trim();
  const consumerKey = (input?.consumerKey ?? settings?.consumerKey)?.trim();

  let passkey = input?.passkey?.trim() ?? '';
  if (!passkey) {
    passkey = tryDecryptMpesaSecret(settings?.passkeyEncrypted) ?? '';
  }

  let consumerSecret = input?.consumerSecret?.trim() ?? '';
  if (!consumerSecret) {
    consumerSecret = tryDecryptMpesaSecret(settings?.consumerSecretEncrypted) ?? '';
  }

  if (!businessShortCode || !consumerKey || !passkey || !consumerSecret) {
    const needsReEntry = Boolean(
      (settings?.passkeyEncrypted || settings?.consumerSecretEncrypted) &&
        (!input?.passkey?.trim() || !input?.consumerSecret?.trim())
    );
    throw new Error(
      needsReEntry
        ? 'Re-enter passkey and consumer secret to test STK credentials (saved secrets must be re-saved after an encryption key change).'
        : 'Consumer key, consumer secret, passkey, and business shortcode are required to test M-PESA credentials'
    );
  }

  return {
    environment,
    shortcodeType,
    businessShortCode,
    passkey,
    consumerKey,
    consumerSecret,
    accountReferencePrefix: (input?.accountReferencePrefix ?? settings?.accountReferencePrefix)?.trim() || 'WF'
  };
};
