import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaDeliveriesRepository } from './prisma-deliveries.repository';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

describe('PrismaDeliveriesRepository', () => {
  const orderId = '00000000-0000-4000-8000-000000000001';
  const deliveryId = '00000000-0000-4000-8000-000000000002';
  const storeId = '00000000-0000-4000-8000-000000000003';
  const productId = '00000000-0000-4000-8000-000000000004';
  const actorId = '00000000-0000-4000-8000-000000000005';
  const line = (quantity: string) => ({
    storeId,
    productId,
    quantity: new Prisma.Decimal(quantity),
  });
  const order = (quantity: string, deliveries: unknown[] = []) => ({
    id: orderId,
    status: 'CONFIRMED',
    lines: [line(quantity)],
    deliveries,
  });

  const tx = {
    $queryRaw: jest.fn(),
    salesOrder: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userStoreAccess: { count: jest.fn() },
    deliveryNote: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    storeStock: { updateMany: jest.fn() },
    stockMovement: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const repository = new PrismaDeliveriesRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.userStoreAccess.count.mockResolvedValue(1);
    tx.storeStock.updateMany.mockResolvedValue({ count: 1 });
    tx.stockMovement.create.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});
    tx.deliveryNote.update.mockResolvedValue({ id: deliveryId, status: 'CONFIRMED' });
    tx.salesOrder.update.mockResolvedValue({});
  });

  it('refuse de créer une livraison supérieure au reliquat', async () => {
    tx.salesOrder.findUnique.mockResolvedValue(
      order('3', [{ status: 'CONFIRMED', lines: [line('2')] }]),
    );
    await expect(
      repository.create(orderId, actorId, {
        lines: [{ storeId, productId, quantity: '2' }],
      }),
    ).rejects.toThrow(ConflictException);
    expect(tx.deliveryNote.create).not.toHaveBeenCalled();
  });

  it('refuse une livraison sans accès au magasin', async () => {
    tx.salesOrder.findUnique.mockResolvedValue(order('3'));
    tx.userStoreAccess.count.mockResolvedValue(0);
    await expect(
      repository.create(orderId, actorId, {
        lines: [{ storeId, productId, quantity: '1' }],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('confirme une livraison partielle et décrémente les réservations', async () => {
    tx.salesOrder.findUnique.mockResolvedValue(
      order('5', [{ id: deliveryId, status: 'DRAFT', lines: [line('2')] }]),
    );
    await repository.confirm(orderId, deliveryId, actorId);
    expect(tx.storeStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          quantity: { decrement: new Prisma.Decimal('2') },
          reserved: { decrement: new Prisma.Decimal('2') },
        },
      }),
    );
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.salesOrder.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { status: 'PARTIALLY_DELIVERED' },
    });
  });

  it('termine la commande lorsque tout est livré', async () => {
    tx.salesOrder.findUnique.mockResolvedValue(
      order('5', [
        { id: deliveryId, status: 'DRAFT', lines: [line('3')] },
        { id: 'other', status: 'CONFIRMED', lines: [line('2')] },
      ]),
    );
    await repository.confirm(orderId, deliveryId, actorId);
    expect(tx.salesOrder.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { status: 'DELIVERED' },
    });
  });

  it('ne débite pas le stock en cas de réservation insuffisante', async () => {
    tx.salesOrder.findUnique.mockResolvedValue(
      order('5', [{ id: deliveryId, status: 'DRAFT', lines: [line('2')] }]),
    );
    tx.storeStock.updateMany.mockResolvedValue({ count: 0 });
    await expect(repository.confirm(orderId, deliveryId, actorId)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.deliveryNote.update).not.toHaveBeenCalled();
  });
});
