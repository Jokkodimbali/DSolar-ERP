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
    salesOrder: { update: jest.fn() },
    userStoreAccess: { count: jest.fn() },
    creditNote: { create: jest.fn(), findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const repository = new PrismaCreditNotesRepository(prisma as unknown as PrismaService);
  const invoice = {
    status: 'ISSUED',
    totalTtc: decimal('118.00'),
    totalTax: decimal('0.00'),
    lines: [],
    order: { id: 'order', amountPaid: decimal('50'), lines: [{ storeId: 'store-1' }] },
    creditNotes: [{ amount: decimal('18.00'), lines: [] }],
    allocations: [{ amount: decimal('50.00') }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.invoice.findUnique.mockResolvedValue(invoice);
    tx.userStoreAccess.count.mockResolvedValue(1);
    tx.creditNote.create.mockResolvedValue({ id: 'credit-1' });
    tx.auditLog.create.mockResolvedValue({});
  });

  it('rejoue un avoir identique sans nouvelle écriture', async () => {
    const operationKey = '00000000-0000-4000-8000-000000000003';
    const saved = { id: 'credit-1', invoiceId, amount: decimal('50'), reason: 'Correction de prix', lines: [] };
    tx.creditNote.findUnique.mockResolvedValue(saved);
    await expect(repository.issue(invoiceId, actorId, '50.00', 'Correction de prix', undefined, operationKey)).resolves.toEqual(saved);
    await expect(repository.issue(invoiceId, actorId, '49.00', 'Correction de prix', undefined, operationKey)).rejects.toThrow(ConflictException);
    expect(tx.creditNote.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('calcule la ventilation sans écrire un avoir', async () => {
    tx.invoice.findUnique.mockResolvedValue({
      ...invoice,
      creditNotes: [],
      allocations: [],
      lines: [{ id: 'line-1', lineTotal: decimal('118'), taxAmount: decimal('18') }],
    });
    await expect(repository.preview(invoiceId, actorId, [{ invoiceLineId: 'line-1', netAmount: '50' }])).resolves.toMatchObject({
      invoiceId, amount: '59.00', netAmount: '50.00', taxAmount: '9.00',
    });
    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });

  it('accepte un avoir égal au solde restant', async () => {
    await repository.issue(invoiceId, actorId, '50.00', 'Correction de prix');
    expect(tx.creditNote.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREDIT_NOTE_ISSUED',
        storeId: 'store-1',
        payload: expect.objectContaining({ storeIds: ['store-1'], invoiceId }),
      }),
    });
  });

  it('conserve les magasins dans le journal pour une facture multi-magasins', async () => {
    tx.invoice.findUnique.mockResolvedValue({
      ...invoice,
      order: { ...invoice.order, lines: [{ storeId: 'store-1' }, { storeId: 'store-2' }] },
    });
    tx.userStoreAccess.count.mockResolvedValue(2);
    await repository.issue(invoiceId, actorId, '10.00', 'Correction de prix');
    const data = tx.auditLog.create.mock.calls[0][0].data;
    expect(data.storeId).toBeUndefined();
    expect(data.payload.storeIds).toEqual(['store-1', 'store-2']);
  });

  it('refuse un avoir supérieur au solde net des affectations', async () => {
    await expect(repository.issue(invoiceId, actorId, '50.01', 'Correction de prix')).rejects.toThrow(
      ConflictException,
    );
    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });

  it('refuse un avoir qui dépasserait le solde après un règlement non affecté', async () => {
    tx.invoice.findUnique.mockResolvedValue({
      ...invoice,
      order: { ...invoice.order, amountPaid: decimal('90') },
      allocations: [],
    });
    await expect(repository.issue(invoiceId, actorId, '10.01', 'Correction de prix')).rejects.toThrow(
      ConflictException,
    );
    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });
  it('exige une ventilation pour un avoir partiel taxable', async () => {
    tx.invoice.findUnique.mockResolvedValue({ ...invoice, totalTax: decimal('18.00') });
    await expect(repository.issue(invoiceId, actorId, '10.00', 'Correction de prix')).rejects.toThrow(
      ConflictException,
    );
    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });

  it('enregistre les montants HT et TVA calculés sur la ligne originale', async () => {
    tx.invoice.findUnique.mockResolvedValue({
      ...invoice,
      totalTax: decimal('18.00'),
      creditNotes: [],
      allocations: [],
      lines: [{ id: 'line-1', lineTotal: decimal('118'), taxAmount: decimal('18') }],
    });
    await repository.issue(invoiceId, actorId, '59.00', 'Correction de prix', [
      { invoiceLineId: 'line-1', netAmount: '50' },
    ]);
    expect(tx.creditNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          netAmount: '50.00',
          taxAmount: '9.00',
          lines: { create: [{ invoiceLineId: 'line-1', netAmount: '50.00', taxAmount: '9.00' }] },
        }),
      }),
    );
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
