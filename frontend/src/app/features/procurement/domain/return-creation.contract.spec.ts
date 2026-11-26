import { describe, expect, it } from 'vitest';
import {
  parseReturnCreation,
  parseReturnOptions,
  returnCreation,
  returnCreationStorageKey,
} from './return-creation.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const row = {
  receiptId: id,
  number: 'BR-CI',
  storeId: id,
  lines: [
    {
      receiptLineId: id,
      productId: id,
      name: 'Panneau',
      sku: 'PV-CI',
      remaining: '1.125',
      available: '1',
      maximum: '1',
      serialized: false,
    },
  ],
};
describe('Création des retours fournisseurs', () => {
  it('normalise les quantités, préserve la clé et refuse tout dépassement', () => {
    const options = parseReturnOptions(row);
    const input = returnCreation(options, { [id]: '0,125' }, ' Défaut ', id);
    expect(parseReturnCreation(JSON.parse(JSON.stringify(input)))).toEqual(input);
    expect(input.lines[0]?.quantity).toBe('0.125');
    expect(returnCreationStorageKey(id)).toContain(id);
    expect(() => returnCreation(options, { [id]: '1.001' }, 'Défaut', id)).toThrow();
    expect(() => returnCreation(options, { [id]: '0' }, 'Défaut', id)).toThrow();
  });
  it('refuse une limite incohérente ou un retour sans séries pour un produit sérialisé', () => {
    expect(() => parseReturnOptions({ ...row, lines: [{ ...row.lines[0], maximum: '2' }] })).toThrow();
    const options = parseReturnOptions({ ...row, lines: [{ ...row.lines[0], serialized: true }] });
    expect(() => returnCreation(options, { [id]: '1' }, 'Défaut', id)).toThrow();
  });
});
