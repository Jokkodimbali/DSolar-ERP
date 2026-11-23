import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaGoodsReceiptsRepository } from './prisma-goods-receipts.repository';

describe('PrismaGoodsReceiptsRepository.confirm', () => {
  it('restreint la liste aux utilisateurs actifs et aux magasins actifs autorisés', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PrismaGoodsReceiptsRepository({
      goodsReceipt: { findMany },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
    } as unknown as PrismaService);
    await repository.list('actor-id');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          store: {
            status: 'ACTIVE',
            userAccess: { some: { userId: 'actor-id', user: { status: 'ACTIVE' } } },
          },
        },
      }),
    );
  });

  it('restreint la consultation individuelle aux mêmes autorisations', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'receipt-id' });
    const repository = new PrismaGoodsReceiptsRepository({
      goodsReceipt: { findFirst },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
    } as unknown as PrismaService);
    await repository.get('receipt-id', 'actor-id');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'receipt-id',
          store: {
            status: 'ACTIVE',
            userAccess: { some: { userId: 'actor-id', user: { status: 'ACTIVE' } } },
          },
        },
      }),
    );
  });

  it('annule atomiquement une réception brouillon autorisée', async () => {
    const tx = {
      goodsReceipt: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'receipt-id', storeId: 'store-id' })
          .mockResolvedValueOnce({ id: 'receipt-id', status: 'CANCELLED' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const repository = new PrismaGoodsReceiptsRepository(prisma);
    await expect(repository.cancel('receipt-id', 'actor-id')).resolves.toEqual({
      id: 'receipt-id',
      status: 'CANCELLED',
    });
    expect(tx.goodsReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: 'receipt-id', status: 'DRAFT' },
      data: { status: 'CANCELLED' },
    });
  });

  it('refuse l’annulation d’une réception déjà traitée', async () => {
    const tx = {
      goodsReceipt: {
        findUnique: jest.fn().mockResolvedValue({ id: 'receipt-id', storeId: 'store-id' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(repository.cancel('receipt-id', 'actor-id')).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuse une annulation sans accès au magasin', async () => {
    const tx = {
      goodsReceipt: {
        findUnique: jest.fn().mockResolvedValue({ id: 'receipt-id', storeId: 'store-id' }),
        updateMany: jest.fn(),
      },
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(repository.cancel('receipt-id', 'actor-id')).rejects.toMatchObject({
      status: 403,
    });
    expect(tx.goodsReceipt.updateMany).not.toHaveBeenCalled();
  });

  it('ne modifie pas une réception introuvable', async () => {
    const tx = {
      goodsReceipt: { findUnique: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(repository.cancel('receipt-id', 'actor-id')).rejects.toMatchObject({
      status: 404,
    });
    expect(tx.goodsReceipt.updateMany).not.toHaveBeenCalled();
  });

  it('refuse de créer une réception sur une commande non confirmée', async () => {
    const tx = {
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
      purchaseOrder: { findUnique: jest.fn().mockResolvedValue({ status: 'DRAFT', lines: [] }) },
      goodsReceipt: { create: jest.fn() },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(
      repository.create(
        {
          number: 'REC-01',
          storeId: 'store-id',
          purchaseOrderId: 'order-id',
          lines: [{ productId: 'product-id', quantity: 1, unitCost: 10 }],
        },
        'actor-id',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
  });

  it('refuse une réception sans lignes avant toute création', async () => {
    const tx = {
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
      purchaseOrder: { findUnique: jest.fn().mockResolvedValue({ status: 'CONFIRMED', lines: [] }) },
      goodsReceipt: { create: jest.fn() },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(
      repository.create(
        { number: 'REC-EMPTY', storeId: 'store-id', purchaseOrderId: 'order-id', lines: [] },
        'actor-id',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
  });

  it('refuse un produit absent de la commande fournisseur', async () => {
    const tx = {
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'CONFIRMED',
          lines: [{ productId: 'ordered-product' }],
        }),
      },
      goodsReceipt: { create: jest.fn() },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(
      repository.create(
        {
          number: 'REC-02',
          storeId: 'store-id',
          purchaseOrderId: 'order-id',
          lines: [{ productId: 'different-product', quantity: 1, unitCost: 10 }],
        },
        'actor-id',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
  });

  it('refuse les produits dupliqués à la création avant toute écriture', async () => {
    const tx = {
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'CONFIRMED',
          lines: [{ productId: 'product-id' }],
        }),
      },
      goodsReceipt: { create: jest.fn() },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(
      repository.create(
        {
          number: 'REC-DUP',
          storeId: 'store-id',
          purchaseOrderId: 'order-id',
          lines: [
            { productId: 'product-id', quantity: 1, unitCost: 10 },
            { productId: 'product-id', quantity: 2, unitCost: 10 },
          ],
        },
        'actor-id',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
  });

  // prettier-ignore
  it.each([
    { previousQuantity: '0', expectedStatus: 'PARTIALLY_DELIVERED' },
    { previousQuantity: '3', expectedStatus: 'DELIVERED' },
  ])('met à jour le statut de commande après réception ($expectedStatus)', async ({ previousQuantity, expectedStatus }) => {
    const receipt = {
      id: 'receipt-id',
      storeId: 'store-id',
      purchaseOrderId: 'order-id',
      status: 'DRAFT',
      lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(2), unitCost: new Prisma.Decimal(10) }],
    };
    const previousReceipts =
      previousQuantity === '0'
        ? []
        : [{ lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(previousQuantity) }] }];
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      goodsReceipt: {
        findUnique: jest.fn().mockResolvedValue(receipt),
        findMany: jest.fn().mockResolvedValue(previousReceipts),
        update: jest.fn().mockResolvedValue({ ...receipt, status: 'CONFIRMED' }),
      },
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-id',
          status: 'CONFIRMED',
          lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(5) }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      storeStock: { upsert: jest.fn().mockResolvedValue({}) },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await repository.confirm('receipt-id', 'actor-id');
    expect(tx.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-id' },
      data: { status: expectedStatus },
    });
    expect(tx.storeStock.upsert).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
  });

  // prettier-ignore
  it('refuse une réception dépassant la quantité commandée sans mouvement de stock', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      goodsReceipt: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'receipt-id',
          storeId: 'store-id',
          purchaseOrderId: 'order-id',
          status: 'DRAFT',
          lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(3), unitCost: new Prisma.Decimal(10) }],
        }),
        findMany: jest.fn().mockResolvedValue([
          { lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(4) }] },
        ]),
        update: jest.fn(),
      },
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-id',
          status: 'PARTIALLY_DELIVERED',
          lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(5) }],
        }),
        update: jest.fn(),
      },
      storeStock: { upsert: jest.fn() },
      stockMovement: { create: jest.fn() },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(repository.confirm('receipt-id', 'actor-id')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.storeStock.upsert).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.purchaseOrder.update).not.toHaveBeenCalled();
    expect(tx.goodsReceipt.update).not.toHaveBeenCalled();
  });

  it('refuse une confirmation sans accès au magasin avant toute mutation', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      goodsReceipt: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'receipt-id',
          storeId: 'store-id',
          status: 'DRAFT',
          purchaseOrderId: 'order-id',
          lines: [],
        }),
        update: jest.fn(),
      },
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue(null) },
      purchaseOrder: { findUnique: jest.fn(), update: jest.fn() },
      storeStock: { upsert: jest.fn() },
      stockMovement: { create: jest.fn() },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(repository.confirm('receipt-id', 'actor-id')).rejects.toMatchObject({ status: 403 });
    expect(tx.purchaseOrder.findUnique).not.toHaveBeenCalled();
    expect(tx.storeStock.upsert).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.goodsReceipt.update).not.toHaveBeenCalled();
  });

  it('refuse la double confirmation avant toute modification de stock', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      goodsReceipt: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'receipt-id',
          storeId: 'store-id',
          status: 'CONFIRMED',
          purchaseOrderId: 'order-id',
          lines: [],
        }),
        update: jest.fn(),
      },
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
      purchaseOrder: { findUnique: jest.fn(), update: jest.fn() },
      storeStock: { upsert: jest.fn() },
      stockMovement: { create: jest.fn() },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(repository.confirm('receipt-id', 'actor-id')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.purchaseOrder.findUnique).not.toHaveBeenCalled();
    expect(tx.storeStock.upsert).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.goodsReceipt.update).not.toHaveBeenCalled();
  });

  // prettier-ignore
  it('propage une erreur de mouvement pour permettre le rollback transactionnel', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      goodsReceipt: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'receipt-id',
          storeId: 'store-id',
          status: 'DRAFT',
          purchaseOrderId: 'order-id',
          lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(2), unitCost: new Prisma.Decimal(10) }],
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-id',
          status: 'CONFIRMED',
          lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(5) }],
        }),
        update: jest.fn(),
      },
      storeStock: { upsert: jest.fn().mockResolvedValue({}) },
      stockMovement: { create: jest.fn().mockRejectedValue(new Error('movement failure')) },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(repository.confirm('receipt-id', 'actor-id')).rejects.toThrow('movement failure');
    expect(tx.storeStock.upsert).toHaveBeenCalledTimes(1);
    expect(tx.purchaseOrder.update).not.toHaveBeenCalled();
    expect(tx.goodsReceipt.update).not.toHaveBeenCalled();
  });

  // prettier-ignore
  it.each([
    { lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(1), unitCost: new Prisma.Decimal(10) }, { productId: 'product-id', quantity: new Prisma.Decimal(1), unitCost: new Prisma.Decimal(10) }] },
    { lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(-1), unitCost: new Prisma.Decimal(10) }] },
    { lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(1), unitCost: new Prisma.Decimal(-10) }] },
  ])('refuse une réception historique invalide sans mouvement de stock %#', async ({ lines }) => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      goodsReceipt: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'receipt-id',
          storeId: 'store-id',
          status: 'DRAFT',
          purchaseOrderId: 'order-id',
          lines,
        }),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
      purchaseOrder: { findUnique: jest.fn(), update: jest.fn() },
      storeStock: { upsert: jest.fn() },
      stockMovement: { create: jest.fn() },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(repository.confirm('receipt-id', 'actor-id')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.storeStock.upsert).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.purchaseOrder.update).not.toHaveBeenCalled();
    expect(tx.goodsReceipt.update).not.toHaveBeenCalled();
  });

  it('ne confirme pas une réception lorsque le cumul dépasse la commande', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      goodsReceipt: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'receipt-id',
          storeId: 'store-id',
          status: 'DRAFT',
          purchaseOrderId: 'order-id',
          lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(3), unitCost: new Prisma.Decimal(10) }],
        }),
        findMany: jest.fn().mockResolvedValue([
          { lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(8) }] },
        ]),
        update: jest.fn(),
      },
      store: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', roles: [] }) },
      userStoreAccess: { findUnique: jest.fn().mockResolvedValue({ userId: 'actor-id' }) },
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-id',
          status: 'PARTIALLY_DELIVERED',
          lines: [{ productId: 'product-id', quantity: new Prisma.Decimal(10) }],
        }),
        update: jest.fn(),
      },
      storeStock: { upsert: jest.fn() },
      stockMovement: { create: jest.fn() },
    };
    const repository = new PrismaGoodsReceiptsRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(repository.confirm('receipt-id', 'actor-id')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.storeStock.upsert).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.purchaseOrder.update).not.toHaveBeenCalled();
    expect(tx.goodsReceipt.update).not.toHaveBeenCalled();
  });

  const serializationConflict = () =>
    new Prisma.PrismaClientKnownRequestError('Serialization conflict', {
      code: 'P2034',
      clientVersion: '6.19.3',
    });

  it('réessaie une transaction après un conflit sérialisable', async () => {
    const result = { id: 'receipt-id', status: 'CONFIRMED' };
    const prisma = {
      $transaction: jest.fn().mockRejectedValueOnce(serializationConflict()).mockResolvedValueOnce(result),
    } as unknown as PrismaService;
    const repository = new PrismaGoodsReceiptsRepository(prisma);

    await expect(repository.confirm('receipt-id', 'actor-id')).resolves.toBe(result);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('retourne un conflit HTTP si les reprises sont épuisées', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(serializationConflict()),
    } as unknown as PrismaService;
    const repository = new PrismaGoodsReceiptsRepository(prisma);

    await expect(repository.confirm('receipt-id', 'actor-id')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
