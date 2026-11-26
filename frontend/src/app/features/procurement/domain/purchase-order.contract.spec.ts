import { describe, expect, it } from 'vitest';
import {
  parsePurchaseOrder,
  parsePurchaseOrderPage,
  parsePurchaseProgress,
  purchaseOrderInput,
} from './purchase-order.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const supplier = {
  id,
  name: 'Fournisseur CI',
  active: true,
  taxId: null,
  phone: null,
  email: null,
  address: null,
};
const line = { id, orderId: id, productId: id, quantity: '1.125', unitCost: '500.25' };
const order = {
  id,
  supplierId: id,
  supplier,
  number: 'CF-CI',
  status: 'DRAFT',
  orderedAt: '2026-11-26T00:00:00Z',
  lines: [line],
};

describe('Contrats des commandes fournisseurs', () => {
  it('préserve les décimales de Prisma et vérifie la pagination', () => {
    expect(parsePurchaseOrder(order).lines[0]?.quantity).toBe('1.125');
    expect(
      parsePurchaseOrderPage({ items: [order], pagination: { page: 1, limit: 10, total: 1, pages: 1 } })
        .total,
    ).toBe(1);
    expect(() => parsePurchaseOrder({ ...order, status: 'UNKNOWN' })).toThrow();
    expect(() => parsePurchaseOrder({ ...order, lines: [line, line] })).toThrow();
  });
  it('valide les quantités, coûts et références du formulaire', () => {
    const draft = { productId: id, quantity: '1,125', unitCost: '500,25' };
    expect(purchaseOrderInput(' cf-ci ', id, [draft])).toEqual({
      number: 'CF-CI',
      supplierId: id,
      lines: [{ productId: id, quantity: 1.125, unitCost: 500.25 }],
    });
    expect(() => purchaseOrderInput('CF', id, [draft, draft])).toThrow();
    expect(() => purchaseOrderInput('CF', id, [{ ...draft, quantity: '0' }])).toThrow();
    expect(() => purchaseOrderInput('CF', id, [{ ...draft, unitCost: '0.001' }])).toThrow();
  });
  it('lit la progression réelle sans recalculer le stock', () => {
    const progress = {
      orderId: id,
      status: 'CONFIRMED',
      totalLines: 1,
      completedLines: 0,
      pendingLines: 1,
      lines: [
        {
          productId: id,
          orderedQuantity: '2',
          receivedQuantity: '1',
          remainingQuantity: '1',
          complete: false,
        },
      ],
    };
    expect(parsePurchaseProgress(progress).lines[0]?.remaining).toBe('1');
    expect(() => parsePurchaseProgress({ ...progress, pendingLines: 0 })).toThrow();
  });
});
