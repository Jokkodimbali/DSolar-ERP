import { describe, expect, it } from 'vitest';
import { parseInvoice, parseInvoicePage } from './invoice.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const row = {
  id,
  customerId: id,
  orderId: id,
  number: 'FAC-CI',
  status: 'DRAFT',
  issuedAt: null,
  totalHt: '2000.00',
  totalTax: '360.00',
  totalTtc: '2360.00',
  lines: [
    {
      id,
      invoiceId: id,
      productId: id,
      quantity: '2',
      unitPrice: '1000',
      discount: '0',
      taxRate: '18',
      taxAmount: '360',
      lineTotal: '2360',
    },
  ],
};
describe('Facturation', () => {
  it('contrôle les totaux HT, TVA et TTC sans flottants', () => {
    expect(parseInvoice(row).totalTtc).toBe('2360.00');
    expect(() => parseInvoice({ ...row, totalTax: '359.99' })).toThrow();
    expect(() => parseInvoice({ ...row, totalTtc: '2360.01' })).toThrow();
    expect(() => parseInvoice({ ...row, status: 'ISSUED' })).toThrow();
  });
  it('contrôle les identifiants et la pagination', () => {
    expect(
      parseInvoicePage({ items: [row], pagination: { page: 1, limit: 10, total: 1, pages: 1 } }).total,
    ).toBe(1);
    expect(() =>
      parseInvoice({ ...row, lines: row.lines.map((line) => ({ ...line, invoiceId: 'autre' })) }),
    ).toThrow();
  });
});
