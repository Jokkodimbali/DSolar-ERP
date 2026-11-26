import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SupplierReturnsRepository } from './supplier-returns.repository';

describe('Protection de la valorisation des retours fournisseurs', () => {
  const D = (value: string) => new Prisma.Decimal(value);
  const line = {
    id: 'line',
    quantity: D('0.5'),
    unitCost: D('0.01'),
    total: D('0.01'),
    serials: [],
    receiptLine: {
      id: 'receipt-line',
      receiptId: 'receipt',
      productId: 'product',
      quantity: D('1'),
      unitCost: D('0.01'),
    },
  };
  const item = {
    id: 'return',
    receiptId: 'receipt',
    status: 'DRAFT',
    receipt: { status: 'CONFIRMED', storeId: 'store', purchaseOrderId: 'order' },
    total: D('0.01'),
    lines: [line],
    credit: null,
  };
  const tx = {
    user: { findFirst: jest.fn() },
    supplierReturn: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    supplierReturnLine: { aggregate: jest.fn() },
    store: { findFirst: jest.fn() },
    serialNumber: { count: jest.fn(), updateMany: jest.fn() },
    storeStock: { findUnique: jest.fn(), updateMany: jest.fn() },
    stockMovement: { create: jest.fn() },
    supplierReturnCredit: { create: jest.fn() },
    goodsReceiptLine: { findUnique: jest.fn() },
  };
  const repository = new SupplierReturnsRepository({
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    tx.user.findFirst.mockResolvedValue({ id: 'admin' });
    tx.supplierReturn.findUnique.mockResolvedValue(item);
    tx.store.findFirst.mockResolvedValue({ id: 'store' });
    tx.supplierReturnLine.aggregate.mockResolvedValue({
      _sum: { quantity: D('0.5'), total: D('0.01') },
    });
  });

  it('interdit la recherche à un utilisateur non administrateur', async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await expect(repository.search('magasinier', { page: 1, limit: 10 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.supplierReturn.findMany).not.toHaveBeenCalled();
    expect(tx.supplierReturn.count).not.toHaveBeenCalled();
  });

  it('pagine les retours avec un filtre commun et un ordre stable', async () => {
    tx.supplierReturn.findMany.mockResolvedValue([item]);
    tx.supplierReturn.count.mockResolvedValue(11);
    const result = await repository.search('admin', {
      page: 2,
      limit: 10,
      status: 'DRAFT',
      storeId: 'store',
      search: ' BR-CI ',
    });
    expect(result).toEqual({ items: [item], pagination: { page: 2, limit: 10, total: 11, pages: 2 } });
    const where = {
      status: 'DRAFT',
      receipt: { storeId: 'store' },
      OR: [
        { reason: { contains: 'BR-CI', mode: 'insensitive' } },
        { receipt: { number: { contains: 'BR-CI', mode: 'insensitive' } } },
        { credit: { reference: { contains: 'BR-CI', mode: 'insensitive' } } },
      ],
    };
    expect(tx.supplierReturn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(tx.supplierReturn.count).toHaveBeenCalledWith({ where });
  });

  it('refuse le cumul des arrondis supérieur à la valeur de réception', async () => {
    await expect(repository.confirm('return', 'admin')).rejects.toThrow(
      'Valorisation cumulée supérieure à la réception.',
    );
    expect(tx.storeStock.updateMany).not.toHaveBeenCalled();
    expect(tx.serialNumber.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it.each([
    { ...line, quantity: D('-0.5') },
    { ...line, unitCost: D('0.02') },
    { ...line, total: D('0.02') },
    { ...line, receiptLine: { ...line.receiptLine, receiptId: 'other' } },
  ])('refuse une ligne historique incohérente %#', async (invalid) => {
    tx.supplierReturn.findUnique.mockResolvedValue({ ...item, total: invalid.total, lines: [invalid] });
    await expect(repository.confirm('return', 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.storeStock.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('refuse un avoir sur un retour dont le total ne correspond pas aux lignes', async () => {
    tx.supplierReturn.findUnique.mockResolvedValue({ ...item, status: 'CONFIRMED', total: D('0.02') });
    await expect(repository.credit('return', 'AV-1', 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.supplierReturnCredit.create).not.toHaveBeenCalled();
  });

  it.each(['', '   ', ' SERIE-1', 'X'.repeat(151)])(
    'refuse un numéro de série invalide avant accès à la réception',
    async (serial) => {
      await expect(repository.registerSerials('receipt-line', [serial], 'admin')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.goodsReceiptLine.findUnique).not.toHaveBeenCalled();
    },
  );
});
