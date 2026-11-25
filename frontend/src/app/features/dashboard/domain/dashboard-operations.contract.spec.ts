import { describe, expect, it } from 'vitest';
import { parseAlerts, parseRecentOrders } from './dashboard-operations.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const product = {
  storeId: id,
  productId: id,
  name: 'Panneau',
  sku: 'PV-01',
  unit: 'u',
  available: '2.500',
  severity: 'LOW_STOCK',
};

describe('Contrats opérationnels du tableau de bord', () => {
  it('respecte le périmètre et les quantités renvoyés par le serveur', () => {
    const response = { storeId: id, threshold: '5', items: [product] };
    expect(parseAlerts(response, id, 'Dakar').items[0]?.available).toBe('2.500');
    expect(() => parseAlerts(response, 'autre', 'Dakar')).toThrow();
    expect(() => parseAlerts({ ...response, items: [product, product] }, id, 'Dakar')).toThrow();
    expect(parseAlerts({ ...response, items: [] }, id, 'Dakar').items).toEqual([]);
  });

  it('affiche le montant exact et distingue le statut du paiement de celui de la commande', () => {
    const order = {
      id,
      number: 'CMD-01',
      total: '9007199254740993.01',
      status: 'CONFIRMED',
      paymentStatus: 'UNPAID',
      createdAt: '2026-11-25T12:00:00.000Z',
    };
    const result = parseRecentOrders({ items: [order] })[0];
    expect(result?.total).toBe('9\u202f007\u202f199\u202f254\u202f740\u202f993,01 FCFA');
    expect(result?.status).toBe('Confirmée');
    expect(result?.paymentStatus).toBe('Impayée');
    expect(() => parseRecentOrders({ items: [{ ...order, paymentStatus: 'UNKNOWN' }] })).toThrow();
    expect(parseRecentOrders({ items: [] })).toEqual([]);
  });
});
