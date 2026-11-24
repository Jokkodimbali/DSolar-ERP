import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaPaymentsRepository } from './prisma-payments.repository';

describe('Isolation des paiements par magasin', () => {
  const tx = {
    salesOrder: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    store: { count: jest.fn() },
    userStoreAccess: { count: jest.fn() },
    payment: { findMany: jest.fn(), create: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const transaction = jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx));
  const repository = new PrismaPaymentsRepository({
    $transaction: transaction,
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.salesOrder.findUnique.mockResolvedValue({
      status: 'DRAFT',
      lines: [{ storeId: 'a' }, { storeId: 'b' }, { storeId: 'a' }],
    });
    tx.user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [] });
    tx.store.count.mockResolvedValue(2);
    tx.userStoreAccess.count.mockResolvedValue(2);
    tx.payment.findMany.mockResolvedValue([{ id: 'payment-1' }]);
  });

  it('lit les paiements et les droits dans le même snapshot transactionnel', async () => {
    await expect(repository.list('order', 'actor')).resolves.toEqual([{ id: 'payment-1' }]);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(tx.userStoreAccess.count).toHaveBeenCalledWith({
      where: { userId: 'actor', storeId: { in: ['a', 'b'] }, store: { status: 'ACTIVE' } },
    });
  });

  it('refuse un magasinier autorisé sur un seul magasin de la commande', async () => {
    tx.userStoreAccess.count.mockResolvedValue(1);
    await expect(repository.list('order', 'actor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.payment.findMany).not.toHaveBeenCalled();
  });

  it('refuse même à un administrateur la lecture d’une commande avec magasin inactif', async () => {
    tx.user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [{ roleId: 'admin' }] });
    tx.store.count.mockResolvedValue(1);
    await expect(repository.list('order', 'actor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.payment.findMany).not.toHaveBeenCalled();
  });

  it('refuse un compte désactivé avant toute lecture de paiements', async () => {
    tx.user.findUnique.mockResolvedValue({ status: 'DISABLED', roles: [] });
    await expect(repository.list('order', 'actor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.payment.findMany).not.toHaveBeenCalled();
  });

  it('contrôle les magasins avant de révéler le statut de la commande', async () => {
    tx.userStoreAccess.count.mockResolvedValue(1);
    const input = {
      amount: '10',
      method: 'CASH' as const,
      idempotencyKey: 'key',
    };
    await expect(repository.record('order', 'actor', input)).rejects.toBeInstanceOf(ForbiddenException);
    tx.userStoreAccess.count.mockResolvedValue(2);
    await expect(repository.record('order', 'actor', input)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});
