import { allocateCredit } from './credit-tax';

describe('Ventilation fiscale des avoirs', () => {
  it('conserve les centimes résiduels sur plusieurs avoirs', () => {
    const line = { id: 'a', total: '0.04', tax: '0.01', priorNet: '0', priorTax: '0' };
    const first = allocateCredit([line], [{ invoiceLineId: 'a', netAmount: '0.01' }], '0.01');
    expect(first.taxAmount).toBe('0.00');
    const second = allocateCredit(
      [{ ...line, priorNet: '0.01' }],
      [{ invoiceLineId: 'a', netAmount: '0.01' }],
      '0.02',
    );
    expect(second.taxAmount).toBe('0.01');
    const third = allocateCredit(
      [{ ...line, priorNet: '0.02', priorTax: '0.01' }],
      [{ invoiceLineId: 'a', netAmount: '0.01' }],
      '0.01',
    );
    expect(third.taxAmount).toBe('0.00');
  });
  it('utilise les taxes historiques distinctes de chaque ligne', () => {
    const result = allocateCredit(
      [
        { id: 'a', total: '118', tax: '18', priorNet: '0', priorTax: '0' },
        { id: 'b', total: '100', tax: '0', priorNet: '0', priorTax: '0' },
      ],
      [
        { invoiceLineId: 'a', netAmount: '50' },
        { invoiceLineId: 'b', netAmount: '10' },
      ],
      '69',
    );
    expect(result.netAmount).toBe('60.00');
    expect(result.taxAmount).toBe('9.00');
  });
  it('refuse un TTC incohérent, une ligne étrangère ou un dépassement', () => {
    const line = { id: 'a', total: '118', tax: '18', priorNet: '90', priorTax: '16.20' };
    expect(() => allocateCredit([line], [{ invoiceLineId: 'a', netAmount: '11' }], '12.98')).toThrow();
    expect(() => allocateCredit([line], [{ invoiceLineId: 'a', netAmount: '10' }], '11.79')).toThrow();
    expect(() => allocateCredit([line], [{ invoiceLineId: 'b', netAmount: '10' }], '11.80')).toThrow();
  });
});
