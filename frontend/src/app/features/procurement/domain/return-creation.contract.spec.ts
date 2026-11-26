import { describe, expect, it } from 'vitest';
import {
  parseAvailableSerials,
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
  it('conserve les séries sélectionnées et refuse les quantités incohérentes', () => {
    const serial = { id, serial: 'PV-001' };
    const options = parseReturnOptions({ ...row, lines: [{ ...row.lines[0], serialized: true }] });
    const input = returnCreation(options, {}, 'Défaut', id, { [id]: [serial] });
    expect(input.lines).toEqual([{ receiptLineId: id, quantity: '1', serialIds: [id] }]);
    expect(parseReturnCreation(JSON.parse(JSON.stringify(input)))).toEqual(input);
    expect(() => returnCreation(options, {}, 'Défaut', id, { [id]: [serial, serial] })).toThrow();
    expect(() =>
      parseReturnCreation({ ...input, lines: [{ ...input.lines[0], quantity: '0.5' }] }),
    ).toThrow();
    const page = {
      receiptLineId: id,
      items: [serial],
      pagination: { page: 1, limit: 10, total: 1, pages: 1 },
    };
    expect(parseAvailableSerials(page, id).items).toEqual([serial]);
    expect(() => parseAvailableSerials({ ...page, receiptLineId: 'invalide' }, id)).toThrow();
  });
});
