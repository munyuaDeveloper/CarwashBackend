import { normalizeKenyanMobile } from './textSmsService';
import type { MpesaOAuthCredentials } from './mpesaCredentials';

export type MpesaEnvironment = 'sandbox' | 'production';
export type MpesaShortcodeType = 'paybill' | 'till';

export type MpesaBusinessCredentials = {
  environment: MpesaEnvironment;
  shortcodeType: MpesaShortcodeType;
  businessShortCode: string;
  passkey: string;
  consumerKey: string;
  consumerSecret: string;
  accountReferencePrefix?: string;
};

export type StkPushInitResult = {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
  rawResponse: unknown;
};

export type StkQueryResult = {
  responseCode: string;
  responseDescription: string;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  resultCode?: string;
  resultDesc?: string;
  rawResponse: unknown;
};

const DARAJA_BASE_URL: Record<MpesaEnvironment, string> = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke'
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export const getDarajaBaseUrl = (environment: MpesaEnvironment): string =>
  DARAJA_BASE_URL[environment];

export const formatMpesaTimestamp = (date = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
};

export const buildStkPassword = (
  businessShortCode: string,
  passkey: string,
  timestamp: string
): string => Buffer.from(`${businessShortCode}${passkey}${timestamp}`).toString('base64');

export const buildAccountReference = (prefix: string, bookingId: string): string => {
  const compactId = bookingId.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
  const reference = `${prefix}${compactId}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  return reference || prefix.slice(0, 12) || 'WF';
};

export const resolveTransactionType = (
  shortcodeType: MpesaShortcodeType,
  environment: MpesaEnvironment = 'sandbox'
): string => {
  // Daraja sandbox (shortcode 174379) only supports CustomerPayBillOnline.
  if (environment === 'sandbox') {
    return 'CustomerPayBillOnline';
  }
  return shortcodeType === 'till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';
};

export const resolveStkTransactionTypeHint = (
  shortcodeType: MpesaShortcodeType,
  environment: MpesaEnvironment
): string | null => {
  if (environment === 'sandbox' && shortcodeType === 'till') {
    return 'Sandbox always uses CustomerPayBillOnline. Use shortcode 174379 with Paybill type for testing.';
  }
  return null;
};

const getCacheKey = (credentials: MpesaBusinessCredentials): string =>
  `${credentials.environment}:${credentials.consumerKey}`;

const enhanceDarajaError = (
  message: string,
  credentials: MpesaBusinessCredentials | MpesaOAuthCredentials,
  stage: 'oauth' | 'stk'
): string => {
  if (/wrong credential/i.test(message)) {
    if (stage === 'oauth') {
      return [
        `Daraja OAuth failed: ${message}.`,
        `Verify consumer key and consumer secret from your Daraja app match the "${credentials.environment}" API`,
        '(sandbox keys only work on sandbox.safaricom.co.ke).'
      ].join(' ');
    }

    return [
      `Daraja STK failed: ${message}.`,
      `Verify the Lipa na M-PESA passkey matches shortcode ${'businessShortCode' in credentials ? credentials.businessShortCode : 'your configured shortcode'}.`,
      credentials.environment === 'sandbox'
        ? 'Sandbox uses shortcode 174379 — copy the passkey from Daraja portal → Lipa na M-PESA Online → Test credentials.'
        : 'Use the passkey issued when your production shortcode was configured on Daraja.'
    ].join(' ');
  }

  return enhanceTransactionTypeError(
    message,
    'businessShortCode' in credentials ? credentials : {
      environment: credentials.environment,
      shortcodeType: 'paybill',
      businessShortCode: '',
      passkey: '',
      consumerKey: credentials.consumerKey,
      consumerSecret: credentials.consumerSecret
    }
  );
};

export const verifyMpesaOAuth = async (
  credentials: MpesaOAuthCredentials
): Promise<{ ok: true; expiresInSeconds: number }> => {
  const cacheKey = `${credentials.environment}:${credentials.consumerKey}`;
  tokenCache.delete(cacheKey);

  const baseUrl = getDarajaBaseUrl(credentials.environment);
  const auth = Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64');

  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` }
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: string | number;
    errorMessage?: string;
  };

  if (!response.ok || !payload.access_token) {
    const detail = payload.errorMessage || `OAuth failed with status ${response.status}`;
    throw new Error(enhanceDarajaError(detail, credentials, 'oauth'));
  }

  const expiresInSeconds = Number(payload.expires_in ?? 3599);
  tokenCache.set(cacheKey, {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(expiresInSeconds - 60, 60) * 1000
  });

  return { ok: true, expiresInSeconds };
};

const enhanceTransactionTypeError = (
  message: string,
  credentials: MpesaBusinessCredentials
): string => {
  if (!/invalid transactiontype/i.test(message)) {
    return message;
  }

  const hint = resolveStkTransactionTypeHint(credentials.shortcodeType, credentials.environment);
  if (hint) {
    return `${message}. ${hint}`;
  }

  if (credentials.environment === 'production') {
    return `${message}. Use CustomerPayBillOnline for paybill numbers and CustomerBuyGoodsOnline for till numbers — check shortcode type in M-PESA settings.`;
  }

  return `${message}. In sandbox, use environment "sandbox", shortcode type "paybill", and shortcode 174379.`;
};

export const getMpesaAccessToken = async (
  credentials: MpesaBusinessCredentials
): Promise<string> => {
  const cacheKey = getCacheKey(credentials);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const baseUrl = getDarajaBaseUrl(credentials.environment);
  const auth = Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString(
    'base64'
  );

  const response = await fetch(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`
      }
    }
  );

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: string | number;
    errorMessage?: string;
  };

  if (!response.ok || !payload.access_token) {
    const detail = payload.errorMessage || `OAuth failed with status ${response.status}`;
    throw new Error(enhanceDarajaError(detail, credentials, 'oauth'));
  }

  const expiresInSeconds = Number(payload.expires_in ?? 3599);
  tokenCache.set(cacheKey, {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(expiresInSeconds - 60, 60) * 1000
  });

  return payload.access_token;
};

export const initiateStkPush = async (
  credentials: MpesaBusinessCredentials,
  params: {
    phoneNumber: string;
    amount: number;
    accountReference: string;
    transactionDesc: string;
    callbackUrl: string;
  }
): Promise<StkPushInitResult> => {
  const formattedPhone = normalizeKenyanMobile(params.phoneNumber);
  if (!formattedPhone) {
    throw new Error('Invalid Kenyan mobile number format');
  }

  const amount = Math.round(params.amount);
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error('Amount must be a positive whole number');
  }

  const timestamp = formatMpesaTimestamp();
  const password = buildStkPassword(
    credentials.businessShortCode,
    credentials.passkey,
    timestamp
  );
  const accessToken = await getMpesaAccessToken(credentials);
  const baseUrl = getDarajaBaseUrl(credentials.environment);

  const transactionType = resolveTransactionType(credentials.shortcodeType, credentials.environment);

  const payload = {
    BusinessShortCode: credentials.businessShortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: transactionType,
    Amount: amount,
    PartyA: formattedPhone,
    PartyB: credentials.businessShortCode,
    PhoneNumber: formattedPhone,
    CallBackURL: params.callbackUrl,
    AccountReference: params.accountReference.slice(0, 12),
    TransactionDesc: params.transactionDesc.slice(0, 13)
  };

  const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const body = (await response.json().catch(() => ({}))) as {
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
    errorMessage?: string;
  };

  if (!response.ok) {
    const detail =
      body.errorMessage ||
      body.ResponseDescription ||
      `STK Push failed with status ${response.status}`;
    throw new Error(enhanceDarajaError(detail, credentials, 'stk'));
  }

  if (!body.CheckoutRequestID || !body.MerchantRequestID) {
    const detail = body.ResponseDescription || 'STK Push response missing checkout identifiers';
    throw new Error(enhanceDarajaError(detail, credentials, 'stk'));
  }

  if (body.ResponseCode !== '0') {
    const detail = body.ResponseDescription || 'STK Push was rejected by Daraja';
    throw new Error(enhanceDarajaError(detail, credentials, 'stk'));
  }

  return {
    merchantRequestId: body.MerchantRequestID,
    checkoutRequestId: body.CheckoutRequestID,
    responseCode: body.ResponseCode,
    responseDescription: body.ResponseDescription || 'Accepted',
    customerMessage: body.CustomerMessage || 'STK Push sent',
    rawResponse: body
  };
};

export const queryStkPushStatus = async (
  credentials: MpesaBusinessCredentials,
  checkoutRequestId: string
): Promise<StkQueryResult> => {
  const timestamp = formatMpesaTimestamp();
  const password = buildStkPassword(
    credentials.businessShortCode,
    credentials.passkey,
    timestamp
  );
  const accessToken = await getMpesaAccessToken(credentials);
  const baseUrl = getDarajaBaseUrl(credentials.environment);

  const response = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      BusinessShortCode: credentials.businessShortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    })
  });

  const body = (await response.json().catch(() => ({}))) as {
    ResponseCode?: string;
    ResponseDescription?: string;
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    ResultCode?: string;
    ResultDesc?: string;
    errorMessage?: string;
  };

  if (!response.ok) {
    throw new Error(body.errorMessage || `STK query failed with status ${response.status}`);
  }

  return {
    responseCode: body.ResponseCode || '',
    responseDescription: body.ResponseDescription || '',
    ...(body.MerchantRequestID ? { merchantRequestId: body.MerchantRequestID } : {}),
    ...(body.CheckoutRequestID ? { checkoutRequestId: body.CheckoutRequestID } : {}),
    ...(body.ResultCode ? { resultCode: body.ResultCode } : {}),
    ...(body.ResultDesc ? { resultDesc: body.ResultDesc } : {}),
    rawResponse: body
  };
};

export const resolveMpesaCallbackUrl = (): string => {
  const explicit = process.env['MPESA_CALLBACK_URL']?.trim();
  if (explicit) return explicit;

  const apiBase = process.env['API_BASE_URL']?.trim().replace(/\/$/, '');
  if (apiBase) {
    return `${apiBase}/api/v1/webhooks/mpesa/stk-callback`;
  }

  throw new Error('MPESA_CALLBACK_URL or API_BASE_URL must be configured');
};
