import { isRecord } from '../../../core/api/api-contract';

export interface PeriodStats {
  readonly month: string;
  readonly revenue: string;
  readonly collected: string;
  readonly orders: number;
  readonly variations: { revenue: string | null; collected: string | null; orders: string | null };
  readonly days: readonly { day: number; revenue: string; orders: number }[];
}

export function parsePeriod(value: unknown, month: string): PeriodStats {
  const invalid = (): never => {
    throw new Error('Statistiques de période invalides.');
  };
  const amount = (raw: unknown): string =>
    typeof raw === 'string' && /^-?\d+\.\d{2}$/.test(raw) ? raw : invalid();
  const count = (raw: unknown): number =>
    typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : invalid();
  const variation = (raw: unknown): string | null =>
    raw === null || (typeof raw === 'string' && /^-?\d+\.\d$/.test(raw)) ? raw : invalid();
  if (
    !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) ||
    !isRecord(value) ||
    value['month'] !== month ||
    value['currency'] !== 'XOF' ||
    value['basis'] !== 'NET_ISSUED_INVOICES_AND_RECORDED_PAYMENTS' ||
    value['comparison'] !== 'PREVIOUS_CALENDAR_MONTH' ||
    !isRecord(value['variations']) ||
    !Array.isArray(value['days'])
  )
    return invalid();
  const year = Number(month.slice(0, 4));
  const selected = Number(month.slice(5));
  if (value['days'].length !== new Date(Date.UTC(year, selected, 0)).getUTCDate()) return invalid();
  const days = value['days'].map((row: unknown, index: number) => {
    if (!isRecord(row) || row['day'] !== index + 1) return invalid();
    return { day: index + 1, revenue: amount(row['revenue']), orders: count(row['orders']) };
  });
  return {
    month,
    revenue: amount(value['revenue']),
    collected: amount(value['collected']),
    orders: count(value['orders']),
    variations: {
      revenue: variation(value['variations']['revenue']),
      collected: variation(value['variations']['collected']),
      orders: variation(value['variations']['orders']),
    },
    days,
  };
}
