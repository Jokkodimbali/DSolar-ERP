import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SupplierPurchasesService } from '../application/supplier-purchases.service';
import { PrismaSupplierPurchasesRepository } from './prisma-supplier-purchases.repository';

describe('Synthèse des achats fournisseurs', () => {
  const tx = {
    user: { findFirst: jest.fn() },
    supplier: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const transaction = jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx));
  const repository = new PrismaSupplierPurchasesRepository({
    $transaction: transaction,
  } as unknown as PrismaService);
  const service = new SupplierPurchasesService(repository);

  beforeEach(() => {
    jest.resetAllMocks();
    transaction.mockImplementation((work) => work(tx));
    tx.user.findFirst.mockResolvedValue({ id: 'admin' });
    tx.supplier.findUnique.mockResolvedValue({ id: 'supplier', name: 'Fournisseur', active: false });
    tx.$queryRaw.mockResolvedValue([{
      confirmedReceipts: '2',
      confirmedReturns: '1',
      recordedCredits: '1',
      receivedValue: '1000.25',
      returnedValue: '100.10',
      creditValue: '100.10',
      netReceivedValue: '900.15',
      returnsAwaitingCredit: '0',
    }]);
  });

  it('interdit la lecture financière aux non-administrateurs', async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await expect(service.summary('supplier', 'actor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.supplier.findUnique).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('refuse un fournisseur inexistant', async () => {
    tx.supplier.findUnique.mockResolvedValue(null);
    await expect(service.summary('supplier', 'admin')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('conserve les avoirs séparés et ne présente pas la valorisation comme une dette', async () => {
    await expect(service.summary('supplier', 'admin')).resolves.toMatchObject({
      supplierId: 'supplier',
      active: false,
      receivedValue: '1000.25',
      returnedValue: '100.10',
      creditValue: '100.10',
      netReceivedValue: '900.15',
      payableBalance: null,
      payableBalanceAvailable: false,
      currency: 'XOF',
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });
});
