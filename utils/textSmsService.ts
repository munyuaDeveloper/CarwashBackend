export type TextSmsGatewayResult = {
  success: boolean;
  messageId?: string;
  rawResponse?: unknown;
  error?: string;
};

type TextSmsResponseItem = {
  'response-code'?: number;
  'respose-code'?: number;
  'response-description'?: string;
  mobile?: number | string;
  messageid?: number | string;
  networkid?: string;
};

type TextSmsApiResponse = {
  responses?: TextSmsResponseItem[];
};

/** API lives on sms.textsms.co.ke — textsms.co.ke returns 404 for /api/services/sendsms/ */
const TEXTSMS_DEFAULT_BASE_URL = 'https://sms.textsms.co.ke';

/** Normalize Kenyan numbers to 254XXXXXXXXX for TextSMS. */
export const normalizeKenyanMobile = (raw: string): string | null => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('254') && digits.length === 12) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return `254${digits.slice(1)}`;
  }
  if (digits.length === 9 && digits.startsWith('7')) {
    return `254${digits}`;
  }

  return null;
};

const getTextSmsConfig = (): { apiKey: string; partnerId: string; shortcode: string; baseUrl: string } | null => {
  const apiKey = process.env['TEXT_API_KEY']?.trim();
  const partnerId = process.env['PARTNER_ID']?.trim();
  const shortcode = process.env['SHORTCODE']?.trim();
  const baseUrl = (process.env['TEXTSMS_BASE_URL'] || TEXTSMS_DEFAULT_BASE_URL).replace(/\/$/, '');

  if (!apiKey || !partnerId || !shortcode) {
    return null;
  }

  return { apiKey, partnerId, shortcode, baseUrl };
};

const parseResponseItem = (item: TextSmsResponseItem): TextSmsGatewayResult => {
  const code = item['response-code'] ?? item['respose-code'];
  const description = item['response-description'] || 'Unknown gateway response';
  const messageId = item.messageid != null ? String(item.messageid) : undefined;

  if (code === 200) {
    return {
      success: true,
      ...(messageId ? { messageId } : {}),
      rawResponse: item
    };
  }

  return {
    success: false,
    error: description,
    rawResponse: item
  };
};

export const sendViaTextSms = async (
  to: string,
  message: string,
  options?: { clientSmsId?: string }
): Promise<TextSmsGatewayResult> => {
  const config = getTextSmsConfig();
  if (!config) {
    return {
      success: false,
      error: 'TextSMS credentials are not configured (TEXT_API_KEY, PARTNER_ID, SHORTCODE)'
    };
  }

  const mobile = normalizeKenyanMobile(to);
  if (!mobile) {
    return {
      success: false,
      error: 'Invalid Kenyan mobile number format'
    };
  }

  const url = `${config.baseUrl}/api/services/sendsms/`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: config.apiKey,
        partnerID: config.partnerId,
        mobile,
        message,
        shortcode: config.shortcode,
        pass_type: 'plain',
        ...(options?.clientSmsId ? { clientsmsid: options.clientSmsId } : {})
      })
    });

    const payload = (await response.json().catch(() => ({}))) as TextSmsApiResponse;

    if (!response.ok) {
      const detail =
        typeof payload === 'object' &&
        payload !== null &&
        'message' in payload &&
        typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : undefined;
      return {
        success: false,
        error: detail
          ? `TextSMS request failed (${response.status}): ${detail}`
          : `TextSMS request failed with status ${response.status} at ${url}`,
        rawResponse: payload
      };
    }

    const first = payload.responses?.[0];
    if (!first) {
      return {
        success: false,
        error: 'TextSMS returned an empty response',
        rawResponse: payload
      };
    }

    const result = parseResponseItem(first);
    return {
      ...result,
      rawResponse: payload
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown TextSMS gateway error'
    };
  }
};
