import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PurchaseOrdersRepository } from './purchase-orders.repository';

describe('PurchaseOrdersRepository status transitions', () => {
  const prisma = {
    purchaseOrder: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  let repository: PurchaseOrdersRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PurchaseOrdersRepository(prisma as unknown as PrismaService);
  });

  it('refuse la création avec un fournisseur désactivé', async () => {
    const tx = {
      supplier: { findUnique: jest.fn().mockResolvedValue({ active: false }) },
      product: { findMany: jest.fn() },
      purchaseOrder: { create: jest.fn() },
    };
    const transactional = new PurchaseOrdersRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(
      transactional.create({
        number: 'CMD-1',
        supplierId: 'supplier-1',
        lines: [{ productId: 'product-1', quantity: 1, unitCost: 10 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('refuse la création si un produit est inactif ou introuvable', async () => {
    const tx = {
      supplier: { findUnique: jest.fn().mockResolvedValue({ active: true }) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseOrder: { create: jest.fn() },
    };
    const transactional = new PurchaseOrdersRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(
      transactional.create({
        number: 'CMD-2',
        supplierId: 'supplier-1',
        lines: [{ productId: 'product-1', quantity: 1, unitCost: 10 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('refuse une commande fournisseur sans lignes', async () => {
    const tx = {
      supplier: { findUnique: jest.fn().mockResolvedValue({ active: true }) },
      product: { findMany: jest.fn() },
      purchaseOrder: { create: jest.fn() },
    };
    const transactional = new PurchaseOrdersRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(transactional.create({ number: 'CMD-EMPTY', supplierId: 'supplier-1', lines: [] })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('refuse les produits dupliqués dans une commande fournisseur', async () => {
    const tx = {
      supplier: { findUnique: jest.fn().mockResolvedValue({ active: true }) },
      product: { findMany: jest.fn() },
      purchaseOrder: { create: jest.fn() },
    };
    const transactional = new PurchaseOrdersRepository({
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(transactional.create({ number: 'CMD-DUP', supplierId: 'supplier-1', lines: [
      { productId: 'product-1', quantity: 1, unitCost: 10 },
      { productId: 'product-1', quantity: 2, unitCost: 10 },
    ] })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('annule atomiquement une commande brouillon', async () => {
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.CANCELLED,
    });

    await expect(repository.cancel('order-1')).resolves.toMatchObject({
      status: OrderStatus.CANCELLED,
    });
    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: OrderStatus.DRAFT },
      data: { status: OrderStatus.CANCELLED },
    });
  });

  it('refuse une seconde annulation sans modifier la commande', async () => {
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.CANCELLED,
    });

    await expect(repository.cancel('order-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('signale une commande introuvable lors de l’annulation', async () => {
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });
    prisma.purchaseOrder.findUnique.mockResolvedValue(null);

    await expect(repository.cancel('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('confirme uniquement une commande encore brouillon', async () => {
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.CONFIRMED,
    });

    await repository.confirm('order-1');
    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: OrderStatus.DRAFT },
      data: { status: OrderStatus.CONFIRMED },
    });
  });

  it('refuse une confirmation concurrente après changement de statut', async () => {
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.CANCELLED,
    });

    await expect(repository.confirm('order-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
