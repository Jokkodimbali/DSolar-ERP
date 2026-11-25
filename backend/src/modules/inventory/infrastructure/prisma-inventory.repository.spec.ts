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
    stockMovement: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
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

  it('limite la recherche de mouvements au magasin autorisé', async () => {
    tx.stockMovement.count.mockResolvedValue(1);
    tx.stockMovement.findMany.mockResolvedValue([{ id: 'm', storeId: 'store', productId: 'product', type: 'INVENTORY_ADJUSTMENT', quantity: new Prisma.Decimal('-1.25'), referenceType: 'MANUAL_ADJUSTMENT', reason: 'Correction', createdAt: new Date('2026-01-01'), product: { name: 'Panneau', sku: 'PV', unit: 'PIECE' } }]);
    const result = await repository.movements('store', 'actor', { page: 1, limit: 10 });
    expect(result.items[0]).toMatchObject({ quantity: '-1.250', sku: 'PV' });
    expect(tx.stockMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 'store' }, skip: 0, take: 10 }));
  });

  it('ne consulte aucun mouvement si le magasin est interdit', async () => {
    tx.userStoreAccess.findFirst.mockResolvedValue(null);
    await expect(repository.movements('store', 'actor', {})).rejects.toThrow(ForbiddenException);
    expect(tx.stockMovement.findMany).not.toHaveBeenCalled();
  });

  it('refuse l’accès avant de révéler un produit introuvable', async () => {
    tx.userStoreAccess.findFirst.mockResolvedValue(null);
    tx.product.findUnique.mockResolvedValue(null);
    await expect(repository.getBalance('store', 'product', 'actor')).rejects.toThrow(ForbiddenException);
    expect(tx.storeStock.findUnique).not.toHaveBeenCalled();
  });
});
