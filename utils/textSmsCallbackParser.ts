export type TextSmsDeliveryStatus = 'delivered' | 'undelivered' | 'pending' | 'unknown';

export type ParsedTextSmsCallback = {
  messageId?: string | undefined;
  mobile?: string | undefined;
  deliveryStatus: TextSmsDeliveryStatus;
  deliveryDescription?: string | undefined;
  clientSmsId?: string | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pickString = (obj: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = obj[key];
    if (value == null) continue;
    const asString = String(value).trim();
    if (asString) return asString;
  }
  return undefined;
};

const normalizeDeliveryStatus = (raw: string | undefined): TextSmsDeliveryStatus => {
  if (!raw) return 'unknown';
  const value = raw.toLowerCase();

  if (
    value.includes('deliveredtoterminal') ||
    value.includes('delivered_to_terminal') ||
    (value.includes('deliver') &&
      !value.includes('not') &&
      !value.includes('fail') &&
      !value.includes('undeliver'))
  ) {
    return 'delivered';
  }
  if (
    value.includes('fail') ||
    value.includes('undeliver') ||
    value.includes('reject') ||
    value.includes('expired') ||
    value.includes('not deliver')
  ) {
    return 'undelivered';
  }
  if (value.includes('pending') || value.includes('submit') || value.includes('queued')) {
    return 'pending';
  }
  if (value === '1' || value === '200' || value === '0' || value === 'success') {
    return 'delivered';
  }
  if (value === '2' || value === '3' || value === '4' || value === '5') {
    return 'undelivered';
  }

  return 'unknown';
};

const parseSingleRecord = (record: Record<string, unknown>): ParsedTextSmsCallback => {
  const nestedMessage = isRecord(record['message']) ? record['message'] : undefined;
  const source = nestedMessage ? { ...record, ...nestedMessage } : record;

  const statusRaw =
    pickString(source, [
      'description',
      'status',
      'delivery_status',
      'deliveryStatus',
      'delivery_status_description',
      'deliveryStatusDescription',
      'delivery_code_detail_description',
      'statdesc',
      'response-description',
      'response_description'
    ]) ||
    (source['status_code'] != null ? String(source['status_code']) : undefined) ||
    (source['delivery_code'] != null ? String(source['delivery_code']) : undefined);

  const parsed: ParsedTextSmsCallback = {
    deliveryStatus: normalizeDeliveryStatus(statusRaw)
  };

  const messageId = pickString(source, ['messageid', 'messageID', 'messageId', 'MessageID']);
  if (messageId) parsed.messageId = messageId;

  const mobile = pickString(source, ['mobile', 'Mobile', 'recipient', 'receiver', 'to', 'phone']);
  if (mobile) parsed.mobile = mobile;

  if (statusRaw) parsed.deliveryDescription = statusRaw;

  const clientSmsId = pickString(source, ['clientsmsid', 'clientSmsId', 'client_sms_id', 'reference', 'ref']);
  if (clientSmsId) parsed.clientSmsId = clientSmsId;

  return parsed;
};

/** Flatten TextSMS / Celcom-style webhook bodies into normalized callback events. */
export const parseTextSmsCallbackPayload = (body: unknown): ParsedTextSmsCallback[] => {
  if (body == null) return [];

  if (Array.isArray(body)) {
    return body.filter(isRecord).map(parseSingleRecord);
  }

  if (!isRecord(body)) return [];

  if (Array.isArray(body['responses'])) {
    return body['responses'].filter(isRecord).map(parseSingleRecord);
  }
  if (Array.isArray(body['data'])) {
    return body['data'].filter(isRecord).map(parseSingleRecord);
  }

  return [parseSingleRecord(body)];
};
