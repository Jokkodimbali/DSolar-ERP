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
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
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

  it('annule une session ouverte sans modifier le stock', async () => {
    tx.inventorySession.findUnique.mockResolvedValue({
      id: 'session-id',
      storeId: 'store-id',
      status: 'DRAFT',
      lines: [],
    });
    tx.inventorySession.updateMany.mockResolvedValue({ count: 1 });
    tx.inventorySession.findUniqueOrThrow.mockResolvedValue({
      id: 'session-id',
      status: 'CANCELLED',
      lines: [],
    });
    await expect(repository.cancel('session-id', 'actor-id')).resolves.toMatchObject({
      status: 'CANCELLED',
    });
    expect(tx.storeStock.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('refuse d’annuler un inventaire validé', async () => {
    tx.inventorySession.findUnique.mockResolvedValue({
      id: 'session-id',
      storeId: 'store-id',
      status: 'VALIDATED',
      lines: [],
    });
    await expect(repository.cancel('session-id', 'actor-id')).rejects.toThrow(ConflictException);
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
      lines: [
        {
          productId: 'product-id',
          counted: new Prisma.Decimal(3),
          expected: new Prisma.Decimal(5),
          reason: 'Comptage',
        },
      ],
    });
    tx.storeStock.findUnique.mockResolvedValue({
      quantity: new Prisma.Decimal(6),
      reserved: new Prisma.Decimal(0),
    });
    await expect(repository.validate('session-id', 'actor-id')).rejects.toThrow(ConflictException);
    expect(tx.storeStock.updateMany).not.toHaveBeenCalled();
  });
  it('régularise un écart positif et journalise le mouvement', async () => {
    tx.inventorySession.findUnique.mockResolvedValue({
      id: 'session-id',
      storeId: 'store-id',
      status: 'DRAFT',
      lines: [
        {
          productId: 'product-id',
          counted: new Prisma.Decimal('8.500'),
          expected: new Prisma.Decimal('5.000'),
          reason: 'Recomptage',
        },
      ],
    });
    tx.storeStock.findUnique.mockResolvedValue({
      quantity: new Prisma.Decimal('5.000'),
      reserved: new Prisma.Decimal('2.000'),
    });
    tx.storeStock.updateMany.mockResolvedValue({ count: 1 });
    tx.inventorySession.updateMany.mockResolvedValue({ count: 1 });
    tx.inventorySession.findUniqueOrThrow.mockResolvedValue({ status: 'VALIDATED' });
    await expect(repository.validate('session-id', 'actor-id')).resolves.toMatchObject({
      status: 'VALIDATED',
    });
    expect(tx.storeStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { quantity: { increment: new Prisma.Decimal('3.500') } },
      }),
    );
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operationKey: 'inventory:session-id:product-id',
        referenceType: 'INVENTORY_SESSION',
        actorId: 'actor-id',
        quantity: new Prisma.Decimal('3.500'),
      }),
    });
  });

  it('refuse une régularisation inférieure aux réservations', async () => {
    tx.inventorySession.findUnique.mockResolvedValue({
      id: 'session-id',
      storeId: 'store-id',
      status: 'DRAFT',
      lines: [
        {
          productId: 'product-id',
          counted: new Prisma.Decimal('1'),
          expected: new Prisma.Decimal('5'),
        },
      ],
    });
    tx.storeStock.findUnique.mockResolvedValue({
      quantity: new Prisma.Decimal('5'),
      reserved: new Prisma.Decimal('2'),
    });
    await expect(repository.validate('session-id', 'actor-id')).rejects.toThrow(ConflictException);
    expect(tx.storeStock.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('ne crée pas de mouvement lorsque le stock compté est exact', async () => {
    tx.inventorySession.findUnique.mockResolvedValue({
      id: 'session-id',
      storeId: 'store-id',
      status: 'DRAFT',
      lines: [
        {
          productId: 'product-id',
          counted: new Prisma.Decimal('5'),
          expected: new Prisma.Decimal('5'),
        },
      ],
    });
    tx.storeStock.findUnique.mockResolvedValue({
      quantity: new Prisma.Decimal('5'),
      reserved: new Prisma.Decimal('0'),
    });
    tx.inventorySession.updateMany.mockResolvedValue({ count: 1 });
    tx.inventorySession.findUniqueOrThrow.mockResolvedValue({ status: 'VALIDATED' });
    await repository.validate('session-id', 'actor-id');
    expect(tx.storeStock.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
