import { describe, expect, it } from 'vitest';
import { matchesProforma, parsePendingProforma } from './pending-proforma.contract';
import { parseProforma } from './proforma-view.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const number = 'PF-' + id.toUpperCase();
const input = {
  number,
  customerId: id,
  lines: [{ productId: id, storeId: id, quantity: 2.125, unitPrice: 1000.25, discount: 0, taxRate: 18 }],
};
const row = {
  id,
  number,
  customerId: id,
  status: 'DRAFT',
  createdAt: '2026-11-26T00:00:00Z',
  issuedAt: null,
  expiresAt: null,
  total: '2508.12',
  lines: [
    {
      id,
      proformaId: id,
      productId: id,
      storeId: id,
      quantity: '2.125',
      unitPrice: '1000.25',
      discount: '0.00',
      taxRate: '18.0000',
      lineTotal: '2508.12',
    },
  ],
};

describe('Reprise sécurisée des devis', () => {
  it('restaure une demande sans modifier la référence ni les quantités', () => {
    expect(parsePendingProforma(JSON.parse(JSON.stringify(input)))).toEqual(input);
    expect(() => parsePendingProforma({ ...input, number: 'PF-INVALID' })).toThrow();
    expect(() => parsePendingProforma({ ...input, lines: [{ ...input.lines[0], quantity: '2' }] })).toThrow();
  });

  it('refuse toute divergence du devis retrouvé', () => {
    const item = parseProforma(row);
    expect(matchesProforma(item, input)).toBe(true);
    expect(matchesProforma(item, { ...input, number: 'PF-AUTRE' })).toBe(false);
    expect(matchesProforma(item, { ...input, lines: input.lines.map((line) => ({ ...line, unitPrice: 1000.26 })) })).toBe(
      false,
    );
    expect(matchesProforma(item, { ...input, expiresAt: '2027-01-01T00:00:00Z' })).toBe(false);
  });
});
