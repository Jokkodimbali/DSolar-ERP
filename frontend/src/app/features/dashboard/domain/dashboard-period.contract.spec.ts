import { describe, expect, it } from 'vitest';
import { parsePeriod } from './dashboard-period.contract';

const month = '2028-02';
const response = {
  month,
  currency: 'XOF',
  basis: 'NET_ISSUED_INVOICES_AND_RECORDED_PAYMENTS',
  comparison: 'PREVIOUS_CALENDAR_MONTH',
  revenue: '0.00',
  collected: '0.00',
  orders: 0,
  variations: { revenue: null, collected: null, orders: null },
  days: Array.from({ length: 29 }, (_, index) => ({
    day: index + 1,
    revenue: '0.00',
    orders: 0,
  })),
};

describe('Statistiques par période', () => {
  it('accepte un mois bissextile et une comparaison indisponible', () => {
    expect(parsePeriod(response, month).days).toHaveLength(29);
    expect(parsePeriod(response, month).variations.revenue).toBeNull();
  });

  it('rejette les dates, montants et compteurs incohérents', () => {
    expect(() => parsePeriod(response, '2028-03')).toThrow();
    expect(() => parsePeriod({ ...response, revenue: 100 }, month)).toThrow();
    expect(() => parsePeriod({ ...response, orders: -1 }, month)).toThrow();
    expect(() => parsePeriod({ ...response, days: response.days.slice(1) }, month)).toThrow();
  });
});
