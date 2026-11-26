import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaSalesDocumentsRepository } from './prisma-sales-documents.repository';

describe('Accès aux justificatifs et livraisons PDF', () => {
  const tx = {
    user: { findFirst: jest.fn() },
    userStoreAccess: { findMany: jest.fn() },
    proforma: { findFirst: jest.fn() },
    payment: { findFirst: jest.fn() },
    deliveryNote: { findFirst: jest.fn() },
  };
  const transaction = jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx));
  const repo = new PrismaSalesDocumentsRepository({ $transaction: transaction } as unknown as PrismaService);
  beforeEach(() => {
    jest.clearAllMocks();
    tx.user.findFirst.mockResolvedValue(null);
    tx.userStoreAccess.findMany.mockResolvedValue([{ storeId: 'store' }]);
    tx.proforma.findFirst.mockResolvedValue(null);
    tx.payment.findFirst.mockResolvedValue(null);
    tx.deliveryNote.findFirst.mockResolvedValue(null);
  });
  it('filtre les proformas sur les identifiants des magasins accessibles', async () => {
    await repo.find('PROFORMA', 'proforma', 'actor');
    expect(tx.userStoreAccess.findMany).toHaveBeenCalledWith({
      where: { userId: 'actor', user: { status: 'ACTIVE' }, store: { status: 'ACTIVE' } },
      select: { storeId: true },
    });
    expect(tx.proforma.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proforma', lines: { some: {}, every: { storeId: { in: ['store'] } } } },
      }),
    );
  });
  it('ne lit aucun devis sans magasin accessible', async () => {
    tx.userStoreAccess.findMany.mockResolvedValue([]);
    await expect(repo.find('PROFORMA', 'proforma', 'actor')).resolves.toBeNull();
    expect(tx.proforma.findFirst).not.toHaveBeenCalled();
  });
  it('contraint la livraison par la commande et les accès aux deux ensembles de lignes', async () => {
    await expect(repo.find('DELIVERY', 'delivery', 'actor', 'order')).resolves.toBeNull();
    const where = tx.deliveryNote.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'delivery', orderId: 'order' });
    expect(where.lines).toEqual(where.order.lines);
    expect(where.lines.every.store.userAccess.some).toMatchObject({
      userId: 'actor',
      user: { status: 'ACTIVE' },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });
  it('contraint les paiements du magasinier à tous les magasins actifs autorisés', async () => {
    await repo.find('PAYMENT', 'payment', 'actor', 'order');
    expect(tx.payment.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'payment',
      orderId: 'order',
      order: {
        lines: {
          some: {},
          every: { store: { status: 'ACTIVE', userAccess: { some: { userId: 'actor' } } } },
        },
      },
    });
  });
  it('applique la règle administrateur des paiements sans autoriser les magasins inactifs', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'actor' });
    await repo.find('PAYMENT', 'payment', 'actor', 'order');
    expect(tx.payment.findFirst.mock.calls[0][0].where.order).toEqual({
      lines: { some: {}, every: { store: { status: 'ACTIVE' } } },
    });
  });
});
