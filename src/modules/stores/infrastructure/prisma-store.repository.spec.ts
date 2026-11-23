import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaStoreRepository } from './prisma-store.repository';

describe('PrismaStoreRepository - journal transactionnel', () => {
  const store = { id: 'store-1', code: 'MAG-1', name: 'Principal', address: null, status: 'ACTIVE' };
  const tx = {
    store: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    storeStock: { count: jest.fn() },
    stockTransfer: { count: jest.fn() },
    $executeRaw: jest.fn(),
  };
  const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
  const repository = new PrismaStoreRepository(prisma as unknown as PrismaService);
  beforeEach(() => {
    jest.clearAllMocks();
    tx.auditLog.create.mockResolvedValue({});
  });

  it('journalise la création dans la même transaction', async () => {
    tx.store.create.mockResolvedValue(store);
    await repository.create({ code: 'MAG-1', name: 'Principal' }, 'admin-1');
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorId: 'admin-1', action: 'STORE_CREATED', entityId: 'store-1',
    }) });
  });

  it('ne journalise pas une modification sans changement', async () => {
    tx.store.findUnique.mockResolvedValue(store);
    tx.store.update.mockResolvedValue(store);
    await repository.update('store-1', { name: 'Principal' }, 'admin-1');
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('journalise la désactivation après vérification des stocks', async () => {
    tx.store.findUnique.mockResolvedValue(store);
    tx.storeStock.count.mockResolvedValue(0);
    tx.stockTransfer.count.mockResolvedValue(0);
    tx.store.update.mockResolvedValue({ ...store, status: 'INACTIVE' });
    await repository.setStatus('store-1', 'INACTIVE', 'admin-1');
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'STORE_DEACTIVATED', actorId: 'admin-1',
    }) });
  });

  it('ne journalise pas une désactivation refusée pour stock non nul', async () => {
    tx.store.findUnique.mockResolvedValue(store);
    tx.storeStock.count.mockResolvedValue(1);
    tx.stockTransfer.count.mockResolvedValue(0);
    await expect(repository.setStatus('store-1', 'INACTIVE', 'admin-1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
