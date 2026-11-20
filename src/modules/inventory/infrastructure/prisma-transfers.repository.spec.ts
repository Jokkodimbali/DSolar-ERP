import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaTransfersRepository } from './prisma-transfers.repository';

describe('PrismaTransfersRepository receipt validation', () => {
  const transfer = {
    id: 'transfer-id', originId: 'origin', destinationId: 'destination', status: 'SHIPPED',
    lines: [{ id: 'line-id', productId: 'product-id', quantity: new Prisma.Decimal(5), receivedQuantity: new Prisma.Decimal(0), damagedQuantity: new Prisma.Decimal(0), missingQuantity: new Prisma.Decimal(0) }],
  };

  it.each([
    { received: '-1', damaged: '0', missing: '0' },
    { received: '0', damaged: '-1', missing: '0' },
    { received: '0', damaged: '0', missing: '-1' },
    { received: 'NaN', damaged: '0', missing: '0' },
  ])('refuse les quantités invalides sans toucher au stock (%j)', async (quantities) => {
    const tx = {
      stockTransfer: { findUnique: jest.fn().mockResolvedValue(transfer), update: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor' }) },
      stockTransferEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      storeStock: { upsert: jest.fn() },
      stockMovement: { create: jest.fn() },
      stockTransferLine: { update: jest.fn() },
    };
    const repository = new PrismaTransfersRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(repository.receive({ id: 'transfer-id', actorId: 'actor', operationKey: 'unique-key', finalize: false, lines: [{ lineId: 'line-id', ...quantities }] })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.storeStock.upsert).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockTransferLine.update).not.toHaveBeenCalled();
    expect(tx.stockTransferEvent.create).not.toHaveBeenCalled();
  });
});
