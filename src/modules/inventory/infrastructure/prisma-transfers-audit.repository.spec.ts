import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaTransfersRepository } from './prisma-transfers.repository';

describe('PrismaTransfersRepository audit', () => {
  const transfer = {
    id: 'transfer-id', originId: 'origin-id', destinationId: 'destination-id',
    status: 'DRAFT', lines: [],
  };
  const tx = {
    user: { findUnique: jest.fn() },
    store: { findUnique: jest.fn() },
    userStoreAccess: { findUnique: jest.fn() },
    stockTransfer: { findUnique: jest.fn(), update: jest.fn() },
    stockTransferEvent: { create: jest.fn(), findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const repository = new PrismaTransfersRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [{ roleId: 'admin' }] });
    tx.store.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    tx.userStoreAccess.findUnique.mockResolvedValue(null);
    tx.stockTransfer.findUnique.mockResolvedValue(transfer);
    tx.stockTransferEvent.create.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({});
  });

  it('journalise une approbation avec acteur et magasins', async () => {
    tx.stockTransfer.update.mockResolvedValue({ ...transfer, status: 'APPROVED' });
    await repository.approve('transfer-id', 'admin-id');
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'TRANSFER_APPROVED', actorId: 'admin-id', storeId: 'origin-id',
      payload: { originId: 'origin-id', destinationId: 'destination-id' },
    }) });
  });

  it('ne journalise pas une approbation déjà effectuée', async () => {
    tx.stockTransfer.findUnique.mockResolvedValue({ ...transfer, status: 'APPROVED' });
    await repository.approve('transfer-id', 'admin-id');
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('journalise une annulation autorisée', async () => {
    tx.stockTransfer.update.mockResolvedValue({ ...transfer, status: 'CANCELLED' });
    await repository.cancel('transfer-id', 'admin-id');
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'TRANSFER_CANCELLED', entityId: 'transfer-id',
    }) });
  });

  it('conserve la transaction sérialisable pour les événements', async () => {
    tx.stockTransfer.update.mockResolvedValue({ ...transfer, status: 'APPROVED' });
    await repository.approve('transfer-id', 'admin-id');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }));
  });
});
