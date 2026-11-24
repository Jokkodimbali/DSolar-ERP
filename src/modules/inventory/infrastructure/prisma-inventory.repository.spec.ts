import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaInventoryRepository } from './prisma-inventory.repository';

describe('Protection des ajustements manuels', () => {
  const tx = {
    store: { findUnique: jest.fn() },
    product: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    userStoreAccess: { findFirst: jest.fn() },
    storeStock: { upsert: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    stockMovement: { findUnique: jest.fn(), create: jest.fn() },
  };
  const transaction = jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx));
  const repository = new PrismaInventoryRepository({ $transaction: transaction } as unknown as PrismaService);
  const input = {
    storeId: 'store',
    productId: 'product',
    actorId: 'actor',
    operationKey: 'key',
    direction: 'IN' as const,
    quantity: '1',
    reason: 'Correction stock',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.store.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    tx.product.findUnique.mockResolvedValue({ active: true });
    tx.user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [] });
    tx.userStoreAccess.findFirst.mockResolvedValue({ id: 'access' });
    tx.stockMovement.findUnique.mockResolvedValue(null);
  });

  it.each(['-1', '0', '0.0001', 'NaN', '1e3', '1000000000000000'])(
    'refuse une quantité invalide avant transaction : %s',
    async (quantity) => {
      await expect(repository.adjust({ ...input, quantity })).rejects.toThrow(ConflictException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each([null, 'other-actor'])('refuse une clé sans propriétaire correspondant : %s', async (actorId) => {
    tx.stockMovement.findUnique.mockResolvedValue({
      ...input,
      actorId,
      type: 'INVENTORY_ADJUSTMENT',
      referenceType: 'MANUAL_ADJUSTMENT',
      quantity: new Prisma.Decimal('1'),
    });
    await expect(repository.adjust(input)).rejects.toThrow(ConflictException);
    expect(tx.storeStock.upsert).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('refuse l’accès avant de révéler un produit introuvable', async () => {
    tx.userStoreAccess.findFirst.mockResolvedValue(null);
    tx.product.findUnique.mockResolvedValue(null);
    await expect(repository.getBalance('store', 'product', 'actor')).rejects.toThrow(ForbiddenException);
    expect(tx.storeStock.findUnique).not.toHaveBeenCalled();
  });
});
