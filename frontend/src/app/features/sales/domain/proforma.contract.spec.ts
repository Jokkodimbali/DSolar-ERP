import { describe, expect, it } from 'vitest';
import { parseCreatedProforma, proformaInput } from './proforma.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const line = { productId: id, storeId: id, quantity: '1,250', unitPrice: '1200', discount: '0', taxRate: '18' };

describe('Création de proforma', () => {
  it('transmet les valeurs saisies sans calcul de total côté client', () => {
    expect(proformaInput(id, [line]).lines).toEqual([{ ...line, quantity: 1.25, unitPrice: 1200, discount: 0, taxRate: 18 }]);
    expect(() => proformaInput(id, [line, line])).toThrow();
    expect(() => proformaInput(id, [{ ...line, quantity: '0' }])).toThrow();
    expect(() => proformaInput(id, [{ ...line, unitPrice: '1.001' }])).toThrow();
    expect(() => proformaInput(id, [{ ...line, taxRate: '101' }])).toThrow();
    expect(parseCreatedProforma({ id, number: 'PF-01', status: 'DRAFT', total: '1770.00' }).total).toBe('1\u202f770,00 FCFA');
  });
});
