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
    proforma: { findUnique: jest.fn(), update: jest.fn() },
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
      lines: [{ storeId }],
    });
    tx.proforma.update.mockResolvedValue({ id, status: DocumentStatus.ISSUED });
    tx.userStoreAccess.count.mockResolvedValue(1);
    tx.auditLog.create.mockResolvedValue({});
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
      lines: [{ storeId }],
    });
    await expect(repository.issue(id, actorId)).rejects.toThrow(ConflictException);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuse l’acceptation d’un devis expiré', async () => {
    tx.proforma.findUnique.mockResolvedValue({
      id,
      status: DocumentStatus.ISSUED,
      expiresAt: new Date('2020-01-01'),
      lines: [{ storeId }],
    });
    await expect(repository.transition(id, DocumentStatus.ISSUED, 'ACCEPTED', actorId)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.proforma.update).not.toHaveBeenCalled();
  });

  it('journalise l’acceptation et le statut précédent', async () => {
    tx.proforma.findUnique.mockResolvedValue({
      id,
      status: DocumentStatus.ISSUED,
      expiresAt: null,
      lines: [{ storeId }],
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

  it('refuse une transition depuis un statut différent', async () => {
    await expect(repository.transition(id, DocumentStatus.ISSUED, 'ACCEPTED', actorId)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
