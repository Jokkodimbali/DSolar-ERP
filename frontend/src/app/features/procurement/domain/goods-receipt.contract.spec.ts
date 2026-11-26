import { describe, expect, it } from 'vitest';
import { parseGoodsReceipt, parseReceiptPage, receiptInput } from './goods-receipt.contract';
import type { PurchaseProgress } from './purchase-order.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const progress: PurchaseProgress = {
  orderId: id,
  status: 'PARTIALLY_DELIVERED',
  lines: [{ productId: id, ordered: '2.125', received: '1', remaining: '1.125', complete: false }],
};
const line = { productId: id, quantity: '1,125', unitCost: '1000,25' };
const receipt = {
  id,
  number: 'BR-CI',
  storeId: id,
  purchaseOrderId: id,
  status: 'DRAFT',
  receivedAt: null,
  lines: [{ id, receiptId: id, productId: id, quantity: '1.125', unitCost: '1000.25' }],
};

describe('Contrats des réceptions', () => {
  it('valide les quantités partielles sans arrondi flottant', () => {
    expect(receiptInput('BR-CI', id, id, [line], progress).lines[0]?.quantity).toBe(1.125);
    expect(() => receiptInput('BR-CI', id, id, [{ ...line, quantity: '1.126' }], progress)).toThrow();
    expect(() => receiptInput('BR-CI', id, id, [line, line], progress)).toThrow();
    expect(() => receiptInput('BR-CI', id, id, [line], { ...progress, status: 'DELIVERED' })).toThrow();
  });
  it('valide les données du serveur et la pagination', () => {
    expect(parseGoodsReceipt(receipt).status).toBe('DRAFT');
    expect(parseReceiptPage({ items: [receipt], pagination: { page: 1, limit: 10, total: 1, pages: 1 } }).total).toBe(1);
    expect(() => parseGoodsReceipt({ ...receipt, status: 'CONFIRMED' })).toThrow();
    expect(() => parseGoodsReceipt({ ...receipt, lines: [] })).toThrow();
  });
});
