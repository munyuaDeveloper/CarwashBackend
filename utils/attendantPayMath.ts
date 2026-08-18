import Business from '../models/businessModel';

export type AttendantPayMode = 'percentage' | 'daily_salary' | 'monthly_salary';

export type AttendantPaySettings = {
  mode: AttendantPayMode;
  attendantPercent: number;
  salaryAmountKes: number;
};

export type PayShares = {
  attendantShare: number;
  companyShare: number;
  mode: AttendantPayMode;
};

export const DEFAULT_ATTENDANT_PAY_SETTINGS: AttendantPaySettings = {
  mode: 'percentage',
  attendantPercent: 40,
  salaryAmountKes: 0
};

const roundKes = (value: number): number => Math.round(value * 100) / 100;

const isSalaryMode = (mode: AttendantPayMode): boolean =>
  mode === 'daily_salary' || mode === 'monthly_salary';

export const normalizeAttendantPaySettings = (raw?: Partial<AttendantPaySettings> | null): AttendantPaySettings => {
  const mode =
    raw?.mode === 'daily_salary' || raw?.mode === 'monthly_salary' || raw?.mode === 'percentage'
      ? raw.mode
      : DEFAULT_ATTENDANT_PAY_SETTINGS.mode;

  const attendantPercent = Number(raw?.attendantPercent);
  const salaryAmountKes = Number(raw?.salaryAmountKes);

  return {
    mode,
    attendantPercent:
      Number.isFinite(attendantPercent) && attendantPercent >= 0 && attendantPercent <= 100
        ? attendantPercent
        : DEFAULT_ATTENDANT_PAY_SETTINGS.attendantPercent,
    salaryAmountKes:
      Number.isFinite(salaryAmountKes) && salaryAmountKes >= 0
        ? salaryAmountKes
        : DEFAULT_ATTENDANT_PAY_SETTINGS.salaryAmountKes
  };
};

export const splitBookingAmount = (amount: number, settings: AttendantPaySettings): PayShares => {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;

  if (isSalaryMode(settings.mode)) {
    return {
      attendantShare: 0,
      companyShare: roundKes(safeAmount),
      mode: settings.mode
    };
  }

  const attendantShare = roundKes((safeAmount * settings.attendantPercent) / 100);
  return {
    attendantShare,
    companyShare: roundKes(safeAmount - attendantShare),
    mode: 'percentage'
  };
};

export const getAttendantPaySettings = async (businessId: string): Promise<AttendantPaySettings> => {
  const business = await Business.findById(businessId).select('attendantPaySettings');
  return normalizeAttendantPaySettings(
    (business?.['attendantPaySettings'] as Partial<AttendantPaySettings> | undefined) ?? null
  );
};

export const getSharesForAmount = async (businessId: string, amount: number): Promise<PayShares> => {
  const settings = await getAttendantPaySettings(businessId);
  return splitBookingAmount(amount, settings);
};

type BookingPayFields = {
  amount?: number;
  attendantShareKes?: number | null;
  companyShareKes?: number | null;
  attendantPayMode?: AttendantPayMode | null;
};

export const getSharesFromBooking = (booking: BookingPayFields): PayShares => {
  const amount = Number(booking.amount || 0);
  if (
    typeof booking.attendantShareKes === 'number' &&
    Number.isFinite(booking.attendantShareKes) &&
    typeof booking.companyShareKes === 'number' &&
    Number.isFinite(booking.companyShareKes)
  ) {
    return {
      attendantShare: booking.attendantShareKes,
      companyShare: booking.companyShareKes,
      mode: booking.attendantPayMode || 'percentage'
    };
  }

  return {
    attendantShare: roundKes(amount * 0.4),
    companyShare: roundKes(amount * 0.6),
    mode: 'percentage'
  };
};

export const paySnapshotFields = (shares: PayShares) => ({
  attendantShareKes: shares.attendantShare,
  companyShareKes: shares.companyShare,
  attendantPayMode: shares.mode
});

const nairobiDateKey = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

export const getPayPeriod = (
  mode: AttendantPayMode,
  date: Date
): { period: 'day' | 'month'; periodKey: string } | null => {
  if (mode === 'daily_salary') {
    return { period: 'day', periodKey: nairobiDateKey(date) };
  }
  if (mode === 'monthly_salary') {
    return { period: 'month', periodKey: nairobiDateKey(date).slice(0, 7) };
  }
  return null;
};
