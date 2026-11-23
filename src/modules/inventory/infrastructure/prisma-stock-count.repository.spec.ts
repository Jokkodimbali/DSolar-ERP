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
    auditLog: { create: jest.fn() },
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
    tx.auditLog.create.mockResolvedValue({});
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
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'INVENTORY_CANCELLED' }),
    });
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
  it('refuse une session dans un magasin inactif', async () => {
    tx.store.findUnique.mockResolvedValue({ status: 'INACTIVE' });
    await expect(repository.start('store-id', 'actor-id')).rejects.toThrow(ConflictException);
    expect(tx.inventorySession.create).not.toHaveBeenCalled();
  });

  it('refuse une session à un utilisateur inactif', async () => {
    tx.user.findUnique.mockResolvedValue({
      status: 'INACTIVE',
      roles: [{ roleId: 'admin' }],
    });
    await expect(repository.start('store-id', 'actor-id')).rejects.toThrow(ForbiddenException);
    expect(tx.inventorySession.create).not.toHaveBeenCalled();
  });

  it('autorise le magasinier affecté au magasin', async () => {
    tx.user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [] });
    tx.userStoreAccess.findFirst.mockResolvedValue({ id: 'access-id' });
    tx.inventorySession.findFirst.mockResolvedValue(null);
    tx.storeStock.findMany.mockResolvedValue([
      { productId: 'product-id', quantity: new Prisma.Decimal('5') },
    ]);
    tx.inventorySession.create.mockResolvedValue({
      id: 'session-id',
      status: 'DRAFT',
      lines: [{ productId: 'product-id' }],
    });
    await expect(repository.start('store-id', 'actor-id')).resolves.toMatchObject({
      status: 'DRAFT',
    });
    expect(tx.inventorySession.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'INVENTORY_STARTED', actorId: 'actor-id' }),
    });
  });

  it('refuse une quantité négative avant de modifier une ligne', async () => {
    tx.inventorySession.findUnique.mockResolvedValue({
      id: 'session-id',
      storeId: 'store-id',
      status: 'DRAFT',
      lines: [{ productId: 'product-id' }],
    });
    await expect(
      repository.record('session-id', 'actor-id', [{ productId: 'product-id', counted: '-1' }]),
    ).rejects.toThrow(ConflictException);
    expect(tx.inventoryLine.update).not.toHaveBeenCalled();
  });

  it('refuse les lignes dupliquées avant toute écriture', async () => {
    tx.inventorySession.findUnique.mockResolvedValue({
      id: 'session-id',
      storeId: 'store-id',
      status: 'DRAFT',
      lines: [{ productId: 'product-id' }],
    });
    await expect(
      repository.record('session-id', 'actor-id', [
        { productId: 'product-id', counted: '2' },
        { productId: 'product-id', counted: '3' },
      ]),
    ).rejects.toThrow(ConflictException);
    expect(tx.inventoryLine.update).not.toHaveBeenCalled();
  });

  it('refuse une validation avec un comptage négatif sans toucher au stock', async () => {
    tx.inventorySession.findUnique.mockResolvedValue({
      id: 'session-id',
      storeId: 'store-id',
      status: 'DRAFT',
      lines: [
        {
          productId: 'product-id',
          counted: new Prisma.Decimal('-1'),
          expected: new Prisma.Decimal('5'),
        },
      ],
    });
    tx.storeStock.findUnique.mockResolvedValue({
      quantity: new Prisma.Decimal('5'),
      reserved: new Prisma.Decimal('0'),
    });
    await expect(repository.validate('session-id', 'actor-id')).rejects.toThrow(ConflictException);
    expect(tx.storeStock.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('refuse de modifier le comptage après validation', async () => {
    tx.inventorySession.findUnique.mockResolvedValue({
      id: 'session-id',
      storeId: 'store-id',
      status: 'VALIDATED',
      lines: [{ productId: 'product-id' }],
    });
    await expect(
      repository.record('session-id', 'actor-id', [{ productId: 'product-id', counted: '3' }]),
    ).rejects.toThrow(ConflictException);
    expect(tx.inventoryLine.update).not.toHaveBeenCalled();
  });

  it('refuse une validation concurrente lorsque le statut a changé', async () => {
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
    tx.inventorySession.updateMany.mockResolvedValue({ count: 0 });
    await expect(repository.validate('session-id', 'actor-id')).rejects.toThrow(ConflictException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
