import { aggregateCents, assertBalanced, calendarDate, cents, moneyText } from './ledger-policy';

describe('Règles comptables', () => {
  it('additionne exactement les agrégats supérieurs à la précision individuelle', () => {
    expect(moneyText(aggregateCents('999999999999999999999999.99') + 1n)).toBe('1000000000000000000000000.00');
    expect(moneyText(aggregateCents('-0.01'))).toBe('-0.01');
  });
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
