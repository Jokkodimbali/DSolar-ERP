import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PurchaseOrdersRepository } from './purchase-orders.repository';

describe('PurchaseOrdersRepository status transitions', () => {
  const prisma = {
    purchaseOrder: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    goodsReceipt: { findMany: jest.fn() },
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
    await expect(
      transactional.create({ number: 'CMD-EMPTY', supplierId: 'supplier-1', lines: [] }),
    ).rejects.toBeInstanceOf(ConflictException);
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
    await expect(
      transactional.create({
        number: 'CMD-DUP',
        supplierId: 'supplier-1',
        lines: [
          { productId: 'product-1', quantity: 1, unitCost: 10 },
          { productId: 'product-1', quantity: 2, unitCost: 10 },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('calcule les livraisons partielles avec des décimales exactes', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      number: 'CMD-001',
      status: OrderStatus.PARTIALLY_DELIVERED,
      lines: [
        { productId: 'p1', quantity: new Prisma.Decimal('10.500') },
        { productId: 'p2', quantity: new Prisma.Decimal('2') },
      ],
    });
    prisma.goodsReceipt.findMany.mockResolvedValue([
      { lines: [{ productId: 'p1', quantity: new Prisma.Decimal('4.250') }] },
      { lines: [{ productId: 'p1', quantity: new Prisma.Decimal('6.250') }] },
    ]);

    const progress = await repository.progress('order-1');

    expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith({
      where: { purchaseOrderId: 'order-1', status: 'CONFIRMED' },
      select: { lines: { select: { productId: true, quantity: true } } },
    });
    expect(progress.lines).toEqual([
      { productId: 'p1', orderedQuantity: '10.5', receivedQuantity: '10.5', remainingQuantity: '0', complete: true },
      { productId: 'p2', orderedQuantity: '2', receivedQuantity: '0', remainingQuantity: '2', complete: false },
    ]);
    expect(progress).toMatchObject({ totalLines: 2, completedLines: 1, pendingLines: 1, complete: false });
  });

  it('retourne 404 si le suivi concerne une commande inexistante', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue(null);
    await expect(repository.progress('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.goodsReceipt.findMany).not.toHaveBeenCalled();
  });

  it('ne charge aucune réception quand aucune commande est en attente', async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([]);
    await expect(repository.outstanding()).resolves.toEqual([]);
    expect(prisma.goodsReceipt.findMany).not.toHaveBeenCalled();
  });

  it('agrège les quantités reçues par commande sans mélanger les produits identiques', async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([
      {
        id: 'o1', number: 'CMD-1', supplierId: 's1', orderedAt: new Date('2026-01-01'),
        status: OrderStatus.PARTIALLY_DELIVERED,
        lines: [{ productId: 'p1', quantity: new Prisma.Decimal('10') }],
      },
      {
        id: 'o2', number: 'CMD-2', supplierId: 's2', orderedAt: new Date('2026-01-02'),
        status: OrderStatus.CONFIRMED,
        lines: [{ productId: 'p1', quantity: new Prisma.Decimal('3') }],
      },
    ]);
    prisma.goodsReceipt.findMany.mockResolvedValue([
      { purchaseOrderId: 'o1', lines: [{ productId: 'p1', quantity: new Prisma.Decimal('4.5') }] },
      { purchaseOrderId: 'o2', lines: [{ productId: 'p1', quantity: new Prisma.Decimal('3') }] },
    ]);
    const outstanding = await repository.outstanding();
    expect(prisma.goodsReceipt.findMany).toHaveBeenCalledTimes(1);
    expect(outstanding).toHaveLength(1);
    expect(outstanding[0]).toMatchObject({
      orderId: 'o1', pendingLines: 1,
      lines: [{ productId: 'p1', orderedQuantity: '10', receivedQuantity: '4.5', remainingQuantity: '5.5', complete: false }],
    });
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
