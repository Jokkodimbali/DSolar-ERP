import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaCreditNotesRepository } from './prisma-credit-notes.repository';

describe('PrismaCreditNotesRepository', () => {
  const invoiceId = '00000000-0000-4000-8000-000000000001';
  const actorId = '00000000-0000-4000-8000-000000000002';
  const decimal = (value: string) => new Prisma.Decimal(value);
  const tx = {
    $queryRaw: jest.fn(),
    invoice: { findUnique: jest.fn() },
    userStoreAccess: { count: jest.fn() },
    creditNote: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const repository = new PrismaCreditNotesRepository(prisma as unknown as PrismaService);
  const invoice = {
    status: 'ISSUED',
    totalTtc: decimal('118.00'),
    order: { lines: [{ storeId: 'store-1' }] },
    creditNotes: [{ amount: decimal('18.00') }],
    allocations: [{ amount: decimal('50.00') }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.invoice.findUnique.mockResolvedValue(invoice);
    tx.userStoreAccess.count.mockResolvedValue(1);
    tx.creditNote.create.mockResolvedValue({ id: 'credit-1' });
    tx.auditLog.create.mockResolvedValue({});
  });

  it('accepte un avoir égal au solde restant', async () => {
    await repository.issue(invoiceId, actorId, '50.00', 'Correction de prix');
    expect(tx.creditNote.create).toHaveBeenCalledTimes(1);
  });

  it('refuse un avoir supérieur au solde net des affectations', async () => {
    await expect(repository.issue(invoiceId, actorId, '50.01', 'Correction de prix')).rejects.toThrow(
      ConflictException,
    );
    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });

  it('refuse un montant négatif ou trop précis', async () => {
    await expect(repository.issue(invoiceId, actorId, '-1', 'Correction de prix')).rejects.toThrow(
      ConflictException,
    );
    await expect(repository.issue(invoiceId, actorId, '1.001', 'Correction de prix')).rejects.toThrow(
      ConflictException,
    );
  });

  it('interdit la création sans accès au magasin', async () => {
    tx.userStoreAccess.count.mockResolvedValue(0);
    await expect(repository.issue(invoiceId, actorId, '10.00', 'Correction de prix')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuse un avoir sur une facture brouillon', async () => {
    tx.invoice.findUnique.mockResolvedValue({ ...invoice, status: 'DRAFT' });
    await expect(repository.issue(invoiceId, actorId, '10.00', 'Correction de prix')).rejects.toThrow(
      ConflictException,
    );
  });
});
