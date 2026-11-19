import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaStockCountRepository } from './prisma-stock-count.repository';

describe('PrismaStockCountRepository', () => {
  const tx = {
    store: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    userStoreAccess: { findFirst: jest.fn() },
    inventorySession: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    inventoryLine: { update: jest.fn() },
    storeStock: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    stockMovement: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
  };
  const repository = new PrismaStockCountRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    tx.store.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    tx.user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [{ roleId: 'admin' }] });
    tx.userStoreAccess.findFirst.mockResolvedValue(null);
  });

  it('refuse un utilisateur sans accès au magasin', async () => {
    tx.user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [] });
    await expect(repository.start('store-id', 'actor-id')).rejects.toThrow(ForbiddenException);
    expect(tx.inventorySession.create).not.toHaveBeenCalled();
  });

  it('refuse une deuxième session ouverte', async () => {
    tx.inventorySession.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(repository.start('store-id', 'actor-id')).rejects.toThrow(ConflictException);
  });

  it('refuse de valider une session sans comptage complet', async () => {
    tx.inventorySession.findUnique.mockResolvedValue({
      id: 'session-id',
      storeId: 'store-id',
      status: 'DRAFT',
      lines: [{ productId: 'product-id', counted: null, expected: new Prisma.Decimal(5) }],
    });
    await expect(repository.validate('session-id', 'actor-id')).rejects.toThrow(ConflictException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('refuse de régulariser un stock modifié après ouverture', async () => {
    tx.inventorySession.findUnique.mockResolvedValue({
      id: 'session-id',
      storeId: 'store-id',
      status: 'DRAFT',
      lines: [{
        productId: 'product-id',
        counted: new Prisma.Decimal(3),
        expected: new Prisma.Decimal(5),
        reason: 'Comptage',
      }],
    });
    tx.storeStock.findUnique.mockResolvedValue({
      quantity: new Prisma.Decimal(6),
      reserved: new Prisma.Decimal(0),
    });
    await expect(repository.validate('session-id', 'actor-id')).rejects.toThrow(ConflictException);
    expect(tx.storeStock.updateMany).not.toHaveBeenCalled();
  });
});
