import { validCashAmount } from './cash-amount';

describe('Montants de trésorerie', () => {
  it.each(['0', '0.01', '100', '9999999999999999.99'])('accepte %s', (value) => {
    expect(validCashAmount(value)).toBe(true);
  });

  it.each(['-1', '0.001', '1e2', 'NaN', 'Infinity', '', '10000000000000000'])('refuse %s', (value) => {
    expect(validCashAmount(value)).toBe(false);
  });

  it.each(['0', '0.00', '-0.00'])('refuse un mouvement nul : %s', (value) => {
    expect(validCashAmount(value, true, false)).toBe(false);
  });

  it('accepte un mouvement sortant exact', () => {
    expect(validCashAmount('-0.01', true, false)).toBe(true);
  });
});
