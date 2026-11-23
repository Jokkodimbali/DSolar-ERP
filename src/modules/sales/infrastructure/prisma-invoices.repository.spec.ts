import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaInvoicesRepository } from './prisma-invoices.repository';

describe('PrismaInvoicesRepository', () => {
  const orderId = '00000000-0000-4000-8000-000000000001';
  const actorId = '00000000-0000-4000-8000-000000000002';
  const storeId = '00000000-0000-4000-8000-000000000003';
  const productId = '00000000-0000-4000-8000-000000000004';
  const invoiceId = '00000000-0000-4000-8000-000000000005';
  const decimal = (value: string) => new Prisma.Decimal(value);
  const order = {
    id: orderId,
    customerId: actorId,
    status: 'CONFIRMED',
    total: decimal('118'),
    invoices: [],
    lines: [
      {
        storeId,
        productId,
        quantity: decimal('2'),
        unitPrice: decimal('50'),
        discount: decimal('0'),
        taxRate: decimal('18'),
      },
    ],
  };
  const tx = {
    $queryRaw: jest.fn(),
    salesOrder: { findUnique: jest.fn() },
    userStoreAccess: { count: jest.fn() },
    invoice: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const repository = new PrismaInvoicesRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.userStoreAccess.count.mockResolvedValue(1);
    tx.salesOrder.findUnique.mockResolvedValue(order);
    tx.invoice.create.mockResolvedValue({ id: invoiceId });
    tx.invoice.update.mockResolvedValue({ id: invoiceId });
    tx.auditLog.create.mockResolvedValue({});
  });

  // prettier-ignore
  it('filtre les factures sur les magasins et utilisateurs actifs', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const scoped = new PrismaInvoicesRepository({ invoice: { findMany } } as unknown as PrismaService);
    await scoped.list(actorId);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { order: { lines: { some: {}, every: { store: {
        status: 'ACTIVE', userAccess: { some: { userId: actorId, user: { status: 'ACTIVE' } } },
      } } } } },
    }));
  });

  // prettier-ignore
  it('exige un accès à un magasin actif pour créer une facture', async () => {
    await repository.createFromOrder(orderId, actorId);
    expect(tx.userStoreAccess.count).toHaveBeenCalledWith({
      where: { userId: actorId, user: { status: 'ACTIVE' }, storeId: { in: [storeId] }, store: { status: 'ACTIVE' } },
    });
  });

  it('calcule HT, TVA et TTC sans arrondi flottant', async () => {
    await repository.createFromOrder(orderId, actorId);
    const call = tx.invoice.create.mock.calls[0][0];
    expect(call.data.totalHt.equals(decimal('100'))).toBe(true);
    expect(call.data.totalTax.equals(decimal('18'))).toBe(true);
    expect(call.data.totalTtc.equals(decimal('118'))).toBe(true);
    expect(call.data.lines.create[0].taxAmount.equals(decimal('18'))).toBe(true);
  });

  it('associe le magasin au journal de création de facture', async () => {
    await repository.createFromOrder(orderId, actorId);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'INVOICE_CREATED',
        storeId,
        payload: { orderId, storeIds: [storeId] },
      }),
    });
  });

  it('journalise une facture multi-magasins sans attribuer un magasin arbitraire', async () => {
    const secondStoreId = '00000000-0000-4000-8000-000000000006';
    tx.salesOrder.findUnique.mockResolvedValue({
      ...order,
      lines: [
        { ...order.lines[0], quantity: decimal('1') },
        { ...order.lines[0], storeId: secondStoreId, quantity: decimal('1') },
      ],
    });
    tx.userStoreAccess.count.mockResolvedValue(2);
    await repository.createFromOrder(orderId, actorId);
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit.storeId).toBeUndefined();
    expect(audit.payload.storeIds).toEqual([storeId, secondStoreId]);
  });

  it('refuse une seconde facture pour la même commande', async () => {
    tx.salesOrder.findUnique.mockResolvedValue({
      ...order,
      invoices: [{ id: invoiceId }],
    });
    await expect(repository.createFromOrder(orderId, actorId)).rejects.toThrow(ConflictException);
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('refuse une facture si le total ne correspond pas à la commande', async () => {
    tx.salesOrder.findUnique.mockResolvedValue({ ...order, total: decimal('117') });
    await expect(repository.createFromOrder(orderId, actorId)).rejects.toThrow(ConflictException);
  });

  it('refuse une commande sans magasin avant de créer la facture', async () => {
    tx.salesOrder.findUnique.mockResolvedValue({ ...order, lines: [] });
    await expect(repository.createFromOrder(orderId, actorId)).rejects.toThrow(ConflictException);
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('refuse la facturation sans accès au magasin', async () => {
    tx.userStoreAccess.count.mockResolvedValue(0);
    await expect(repository.createFromOrder(orderId, actorId)).rejects.toThrow(ForbiddenException);
  });

  it('interdit l’annulation directe d’une facture émise', async () => {
    tx.invoice.findUnique.mockResolvedValue({
      id: invoiceId,
      status: 'ISSUED',
      order: { lines: order.lines },
      allocations: [],
      creditNotes: [],
    });
    await expect(repository.cancel(invoiceId, actorId)).rejects.toThrow(ConflictException);
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });
});
