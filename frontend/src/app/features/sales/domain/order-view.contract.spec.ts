import { describe, expect, it } from 'vitest';
import { matchesOrderAction, orderActions, parseOrderDetail, parseOrderPage } from './order-view.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const order = {
  id,
  number: 'CMD-01',
  proformaId: id,
  customerId: id,
  customer: { name: 'Client CI' },
  total: '2360.00',
  status: 'CONFIRMED',
  paymentStatus: 'UNPAID',
  createdAt: '2026-11-25T12:00:00Z',
  lines: [
    {
      id,
      orderId: id,
      productId: id,
      discount: '0',
      taxRate: '18',
      product: { name: 'Panneau', sku: 'PV-01' },
      store: { name: 'Dakar' },
      quantity: '2',
      unitPrice: '1000',
      lineTotal: '2360',
    },
  ],
};

describe('Consultation des commandes', () => {
  it('lit les lignes et les montants exacts', () => {
    expect(parseOrderDetail(order, id).lines[0]?.total).toBe('2\u202f360,00 FCFA');
    expect(parseOrderDetail(order, id).customerName).toBe('Client CI');
    expect(() => parseOrderDetail(order, 'autre')).toThrow();
    expect(() => parseOrderDetail({ ...order, total: '2360.01' }, id)).toThrow();
    expect(orderActions('DRAFT')).toEqual(['confirm', 'cancel']);
    expect(orderActions('CONFIRMED')).toEqual(['cancel']);
    expect(orderActions('DELIVERED')).toEqual([]);
    expect(matchesOrderAction(parseOrderDetail(order, id), id, 'confirm')).toBe(true);
    expect(matchesOrderAction(parseOrderDetail(order, id), id, 'cancel')).toBe(false);
  });

  it('valide les compteurs de pagination', () => {
    expect(
      parseOrderPage({ items: [order], pagination: { page: 1, limit: 20, total: 1, pages: 1 } }).total,
    ).toBe(1);
    expect(() =>
      parseOrderPage({ items: [order], pagination: { page: 1, limit: 20, total: -1, pages: 1 } }),
    ).toThrow();
  });
});
