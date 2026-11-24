import { assertBalanced, calendarDate, cents } from './ledger-policy';

describe('Règles comptables', () => {
  it('conserve les centimes sans arrondi flottant', () => {
    expect(cents('9999999999999999.99')).toBe(999999999999999999n);
  });
  it('refuse une écriture déséquilibrée', () => {
    expect(() =>
      assertBalanced([
        { accountId: 'a', debit: '10', credit: '0' },
        { accountId: 'b', debit: '0', credit: '9.99' },
      ]),
    ).toThrow();
  });
  it('accepte une écriture équilibrée', () => {
    expect(() =>
      assertBalanced([
        { accountId: 'a', debit: '10', credit: '0' },
        { accountId: 'b', debit: '0', credit: '10' },
      ]),
    ).not.toThrow();
  });
  it('refuse les dates impossibles', () => {
    expect(() => calendarDate('2026-02-30')).toThrow();
  });
});
