import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaCreditNotesRepository } from './prisma-credit-notes.repository';
import { PrismaInvoicesRepository } from './prisma-invoices.repository';

describe('Autorisation des factures et avoirs', () => {
  const order = {
    status: 'DRAFT',
    lines: [{ storeId: 'a' }, { storeId: 'b' }],
    invoices: [],
  };
  const tx = {
    $queryRaw: jest.fn(),
    salesOrder: { findUnique: jest.fn() },
    invoice: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    creditNote: { create: jest.fn() },
    userStoreAccess: { count: jest.fn() },
  };
  const prisma = {
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PrismaService;
  const invoices = new PrismaInvoicesRepository(prisma);
  const credits = new PrismaCreditNotesRepository(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.salesOrder.findUnique.mockResolvedValue(order);
    tx.invoice.findUnique.mockResolvedValue({
      status: 'ISSUED',
      order,
      allocations: [],
      creditNotes: [],
    });
    tx.userStoreAccess.count.mockResolvedValue(1);
  });

  const operations = [
    ['création', () => invoices.createFromOrder('order', 'actor')],
    ['émission', () => invoices.issue('invoice', 'actor')],
    ['annulation', () => invoices.cancel('invoice', 'actor')],
    ['avoir', () => credits.issue('invoice', 'actor', '10', 'Motif de correction')],
  ] as const;

  it.each(operations)('refuse un accès partiel avant les règles métier : %s', async (_, run) => {
    tx.invoice.findUnique.mockResolvedValue({
      status: 'CANCELLED',
      order,
      allocations: [],
      creditNotes: [],
    });
    await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.userStoreAccess.count).toHaveBeenCalledWith({
      where: {
        userId: 'actor',
        user: { status: 'ACTIVE' },
        storeId: { in: ['a', 'b'] },
        store: { status: 'ACTIVE' },
      },
    });
    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });

  it.each(operations)('conserve les règles métier pour un acteur autorisé : %s', async (_, run) => {
    tx.userStoreAccess.count.mockResolvedValue(2);
    tx.invoice.findUnique.mockResolvedValue({
      status: 'CANCELLED',
      order,
      allocations: [],
      creditNotes: [],
    });
    await expect(run()).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuse les factures sans commande avant toute mutation', async () => {
    tx.invoice.findUnique.mockResolvedValue({ status: 'DRAFT', order: null });
    await expect(invoices.issue('invoice', 'actor')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(invoices.cancel('invoice', 'actor')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(credits.issue('invoice', 'actor', '10', 'Motif de correction')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });
});
