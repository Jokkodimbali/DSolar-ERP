import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DocumentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaProformasRepository } from './prisma-proformas.repository';

describe('PrismaProformasRepository status transitions', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const storeId = '00000000-0000-4000-8000-000000000002';
  const actorId = '00000000-0000-4000-8000-000000000003';
  const tx = {
    $queryRaw: jest.fn(),
    proforma: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    product: { findMany: jest.fn() },
    customer: { findUnique: jest.fn() },
    store: { findMany: jest.fn() },
    proformaLine: { findMany: jest.fn(), deleteMany: jest.fn() },
    userStoreAccess: { count: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const repository = new PrismaProformasRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.proforma.findUnique.mockResolvedValue({
      id,
      status: DocumentStatus.DRAFT,
      expiresAt: null,
      lines: [{ storeId, productId: 'product', discount: new Prisma.Decimal(0) }],
    });
    tx.proforma.update.mockResolvedValue({ id, status: DocumentStatus.ISSUED });
    tx.userStoreAccess.count.mockResolvedValue(1);
    tx.auditLog.create.mockResolvedValue({});
    tx.customer.findUnique.mockResolvedValue({ id: 'customer' });
    tx.store.findMany.mockResolvedValue([{ id: storeId }]);
    tx.proformaLine.findMany.mockResolvedValue([{ storeId }]);
    tx.product.findMany.mockResolvedValue([{ id: 'product', isSolarPlant: false }]);
    tx.proforma.create.mockResolvedValue({ id });
  });

  it('émet un devis avec audit dans la transaction', async () => {
    await repository.issue(id, actorId);
    expect(tx.proforma.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: DocumentStatus.ISSUED }) }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId,
        action: 'PROFORMA_ISSUED',
        storeId,
        entityId: id,
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('refuse une émission sans accès au magasin', async () => {
    tx.userStoreAccess.count.mockResolvedValue(0);
    await expect(repository.issue(id, actorId)).rejects.toThrow(ForbiddenException);
    expect(tx.proforma.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuse une double émission', async () => {
    tx.proforma.findUnique.mockResolvedValue({
      id,
      status: DocumentStatus.ISSUED,
      expiresAt: null,
      lines: [{ storeId, productId: 'product', discount: new Prisma.Decimal(0) }],
    });
    await expect(repository.issue(id, actorId)).rejects.toThrow(ConflictException);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuse l’acceptation d’un devis expiré', async () => {
    tx.proforma.findUnique.mockResolvedValue({
      id,
      status: DocumentStatus.ISSUED,
      expiresAt: new Date('2020-01-01'),
      lines: [{ storeId, productId: 'product', discount: new Prisma.Decimal(0) }],
    });
    await expect(repository.transition(id, DocumentStatus.ISSUED, 'ACCEPTED', actorId)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.proforma.update).not.toHaveBeenCalled();
  });

  it('refuse une expiration anticipée ou sans échéance', async () => {
    for (const expiresAt of [null, new Date('2999-01-01')]) {
      tx.proforma.findUnique.mockResolvedValue({
        id,
        status: DocumentStatus.ISSUED,
        expiresAt,
        lines: [{ storeId }],
      });
      await expect(repository.transition(id, 'ISSUED', 'EXPIRED', actorId)).rejects.toThrow(
        ConflictException,
      );
    }
    expect(tx.proforma.update).not.toHaveBeenCalled();
  });
  it('journalise une expiration arrivée à échéance', async () => {
    tx.proforma.findUnique.mockResolvedValue({
      id,
      status: DocumentStatus.ISSUED,
      expiresAt: new Date('2020-01-01'),
      lines: [{ storeId }],
    });
    await repository.transition(id, 'ISSUED', 'EXPIRED', actorId);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'PROFORMA_EXPIRED' }),
    });
  });
  it('journalise l’acceptation et le statut précédent', async () => {
    tx.proforma.findUnique.mockResolvedValue({
      id,
      status: DocumentStatus.ISSUED,
      expiresAt: null,
      lines: [{ storeId, productId: 'product', discount: new Prisma.Decimal(0) }],
    });
    await repository.transition(id, DocumentStatus.ISSUED, 'ACCEPTED', actorId);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'PROFORMA_ACCEPTED',
        storeId,
        payload: {
          storeIds: [storeId],
          previousStatus: DocumentStatus.ISSUED,
          newStatus: 'ACCEPTED',
        },
      }),
    });
  });

  it('refuse une acceptation directe depuis un brouillon', async () => {
    await expect(repository.transition(id, DocumentStatus.DRAFT, 'ACCEPTED', actorId)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.proforma.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuse de réactiver un devis annulé', async () => {
    tx.proforma.findUnique.mockResolvedValue({
      id,
      status: DocumentStatus.CANCELLED,
      expiresAt: null,
      lines: [{ storeId, productId: 'product', discount: new Prisma.Decimal(0) }],
    });
    await expect(repository.transition(id, DocumentStatus.CANCELLED, 'ACCEPTED', actorId)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.proforma.update).not.toHaveBeenCalled();
  });

  it('autorise l’annulation d’un brouillon avec audit', async () => {
    await repository.transition(id, DocumentStatus.DRAFT, 'CANCELLED', actorId);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'PROFORMA_CANCELLED', entityId: id }),
    });
  });

  it('refuse une transition depuis un statut différent', async () => {
    await expect(repository.transition(id, DocumentStatus.ISSUED, 'ACCEPTED', actorId)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  const input = {
    customerId: 'customer',
    lines: [{ productId: 'product', storeId, quantity: 2, unitPrice: 100, discount: 10, taxRate: 18 }],
  };

  it('refuse une remise sur un produit ordinaire lors de la création', async () => {
    await expect(repository.create(input, actorId)).rejects.toThrow(ConflictException);
    expect(tx.proforma.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('autorise une remise sur une centrale solaire et conserve la trace du montant', async () => {
    tx.product.findMany.mockResolvedValue([{ id: 'product', isSolarPlant: true }]);
    await repository.create(input, actorId);
    expect(tx.proforma.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ total: new Prisma.Decimal('224.20') }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          discounts: [{ productId: 'product', storeId, amount: '10.00' }],
        }),
      }),
    });
  });

  it('autorise la vente d’un produit ordinaire sans remise', async () => {
    await expect(
      repository.create(
        {
          ...input,
          lines: [{ ...input.lines[0], discount: 0 }],
        },
        actorId,
      ),
    ).resolves.toMatchObject({ id });
  });

  it('empêche le contournement par modification du brouillon', async () => {
    await expect(repository.update(id, input, actorId)).rejects.toThrow(ConflictException);
    expect(tx.proformaLine.deleteMany).not.toHaveBeenCalled();
    expect(tx.proforma.update).not.toHaveBeenCalled();
  });

  it('contrôle à nouveau l’éligibilité du brouillon avant émission', async () => {
    tx.proforma.findUnique.mockResolvedValue({
      id,
      status: DocumentStatus.DRAFT,
      expiresAt: null,
      lines: [{ storeId, productId: 'product', discount: new Prisma.Decimal(10) }],
    });
    await expect(repository.issue(id, actorId)).rejects.toThrow(ConflictException);
    expect(tx.proforma.update).not.toHaveBeenCalled();
  });
});
