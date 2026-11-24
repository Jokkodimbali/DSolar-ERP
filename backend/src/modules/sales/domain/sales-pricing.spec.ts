import { calculateSalesLine, calculateSalesTotals } from './sales-pricing';

describe('Calcul commercial commun', () => {
  const base = { quantity: '2', unitPrice: '100', discount: '10', taxRate: '18' };
  it('calcule la remise avant la TVA', () => {
    expect(calculateSalesLine(base)).toEqual({ net: '190.00', tax: '34.20', total: '224.20' });
  });
  it('arrondit le HT puis la TVA en cas de quantité fractionnaire', () => {
    expect(calculateSalesLine({ ...base, quantity: '0.025', unitPrice: '1', discount: '0' })).toEqual({
      net: '0.03',
      tax: '0.01',
      total: '0.04',
    });
  });
  it('gère les exonérations et la remise intégrale', () => {
    expect(calculateSalesLine({ ...base, taxRate: '0' }).total).toBe('190.00');
    expect(calculateSalesLine({ ...base, discount: '200' }).total).toBe('0.00');
  });
  it('additionne exactement les lignes déjà arrondies', () => {
    const line = { ...base, quantity: '0.025', unitPrice: '1', discount: '0' };
    expect(calculateSalesTotals([line, line])).toMatchObject({
      totalHt: '0.06',
      totalTax: '0.02',
      totalTtc: '0.08',
    });
  });
  it.each([
    { quantity: '0' },
    { quantity: '1.0001' },
    { discount: '201' },
    { taxRate: '100.0001' },
    { unitPrice: '-1' },
    { unitPrice: '1e3' },
    { unitPrice: '1.001' },
    { quantity: '999999999999999', unitPrice: '9999999999999999.99' },
  ])('refuse les valeurs invalides : %j', (patch) => {
    expect(() => calculateSalesLine({ ...base, ...patch })).toThrow();
  });
  it('refuse un total de document supérieur à la capacité PostgreSQL', () => {
    const line = { quantity: '1', unitPrice: '9999999999999999.99', discount: '0', taxRate: '0' };
    expect(() => calculateSalesTotals([line, line])).toThrow();
  });
});
