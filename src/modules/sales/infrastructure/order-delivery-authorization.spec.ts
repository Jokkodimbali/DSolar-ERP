import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaDeliveriesRepository } from './prisma-deliveries.repository';
import { PrismaOrdersRepository } from './prisma-orders.repository';

describe('Sécurité des commandes et des livraisons', () => {
  const line = { storeId: 'store-a', productId: 'product', quantity: new Prisma.Decimal(2) };
  const otherLine = { ...line, storeId: 'store-b' };
  const order = { status: 'CANCELLED', lines: [line, otherLine], deliveries: [], payments: [] };
  const tx = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    salesOrder: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    proforma: { findUnique: jest.fn() },
    deliveryNote: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    userStoreAccess: { count: jest.fn() },
    storeStock: { updateMany: jest.fn() },
    stockMovement: { create: jest.fn() },
  };
  const prisma = {
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PrismaService;
  const orders = new PrismaOrdersRepository(prisma);
  const deliveries = new PrismaDeliveriesRepository(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.salesOrder.findUnique.mockResolvedValue(order);
    tx.proforma.findUnique.mockResolvedValue({ status: 'DRAFT', lines: order.lines });
    tx.deliveryNote.findFirst.mockResolvedValue({ status: 'CONFIRMED', order });
    tx.userStoreAccess.count.mockResolvedValue(1);
  });

  const operations: [string, () => Promise<unknown>][] = [
    ['confirmation commande', () => orders.confirm('order', 'actor')],
    ['annulation commande', () => orders.cancel('order', 'actor')],
    ['conversion proforma', () => orders.convert('proforma', 'actor')],
    ['création livraison', () => deliveries.create('order', 'actor', { lines: [] })],
    ['confirmation livraison', () => deliveries.confirm('order', 'delivery', 'actor')],
    ['annulation livraison', () => deliveries.cancel('order', 'delivery', 'actor')],
  ];

  it.each(operations)('refuse un accès partiel avant les règles métier : %s', async (_, run) => {
    await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.userStoreAccess.count).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.storeStock.updateMany).not.toHaveBeenCalled();
    expect(tx.salesOrder.update).not.toHaveBeenCalled();
    expect(tx.salesOrder.create).not.toHaveBeenCalled();
    expect(tx.deliveryNote.create).not.toHaveBeenCalled();
    expect(tx.deliveryNote.update).not.toHaveBeenCalled();
  });

  it.each(operations)('conserve les règles de statut pour un acteur autorisé : %s', async (_, run) => {
    tx.userStoreAccess.count.mockResolvedValue(2);
    await expect(run()).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuse une commande sans magasin même si le nombre de droits est nul', async () => {
    tx.salesOrder.findUnique.mockResolvedValue({ ...order, status: 'DRAFT', lines: [] });
    tx.userStoreAccess.count.mockResolvedValue(0);
    await expect(orders.confirm('order', 'actor')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(orders.cancel('order', 'actor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.salesOrder.update).not.toHaveBeenCalled();
  });

  it('refuse une quantité négative masquée par une autre ligne lors de la réservation', async () => {
    tx.userStoreAccess.count.mockResolvedValue(1);
    tx.salesOrder.findUnique.mockResolvedValue({
      ...order,
      status: 'DRAFT',
      lines: [line, { ...line, quantity: new Prisma.Decimal(-1) }],
    });
    await expect(orders.confirm('order', 'actor')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('refuse une quantité négative masquée dans un bon de livraison', async () => {
    tx.userStoreAccess.count.mockResolvedValue(1);
    tx.salesOrder.findUnique.mockResolvedValue({
      ...order,
      status: 'CONFIRMED',
      lines: [line],
      deliveries: [
        {
          id: 'delivery',
          status: 'DRAFT',
          lines: [line, { ...line, quantity: new Prisma.Decimal(-1) }],
        },
      ],
    });
    await expect(deliveries.confirm('order', 'delivery', 'actor')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.storeStock.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
