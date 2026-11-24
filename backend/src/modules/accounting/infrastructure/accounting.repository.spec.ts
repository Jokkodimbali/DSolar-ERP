import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AccountingRepository } from './accounting.repository';

describe('Cohérence des échecs de comptabilisation automatique', () => {
  const item = {
    periodId: 'period',
    actorId: 'admin',
    revision: 2,
    type: 'INVOICE' as const,
    id: 'invoice',
  };
  const tx = {
    user: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    ledgerAutomation: { findUnique: jest.fn() },
    ledgerPeriod: { findUnique: jest.fn() },
    ledgerEntry: { findUnique: jest.fn() },
    ledgerAutomationFailure: { upsert: jest.fn(), deleteMany: jest.fn() },
  };
  const transaction = jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx));
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: transaction,
  };
  const repo = new AccountingRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([item]);
    tx.user.findFirst.mockResolvedValue({ id: item.actorId });
    tx.ledgerAutomation.findUnique.mockResolvedValue({
      enabled: true,
      revision: item.revision,
      actorId: item.actorId,
    });
    tx.ledgerPeriod.findUnique.mockResolvedValue({ id: item.periodId, closedAt: null });
    tx.ledgerEntry.findUnique.mockResolvedValue(null);
  });

  afterEach(() => jest.restoreAllMocks());

  it('ne conserve pas un échec si une autre transaction a déjà validé la pièce', async () => {
    jest.spyOn(repo, 'postSource').mockRejectedValue(new ConflictException('Conflit'));
    tx.ledgerEntry.findUnique.mockResolvedValue({ postedAt: new Date() });
    await expect(repo.runAutomaticCycle()).resolves.toEqual({ processed: 0, failed: 1 });
    expect(tx.ledgerAutomationFailure.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { enabled: false, revision: 2, actorId: 'admin' },
    { enabled: true, revision: 3, actorId: 'admin' },
    { enabled: true, revision: 2, actorId: 'other' },
  ])('ignore une configuration devenue obsolète : %j', async (config) => {
    jest.spyOn(repo, 'postSource').mockRejectedValue(new ConflictException('Conflit'));
    tx.ledgerAutomation.findUnique.mockResolvedValue(config);
    await repo.runAutomaticCycle();
    expect(tx.ledgerAutomationFailure.upsert).not.toHaveBeenCalled();
  });

  it('ignore un échec après clôture de la période', async () => {
    jest.spyOn(repo, 'postSource').mockRejectedValue(new ConflictException('Conflit'));
    tx.ledgerPeriod.findUnique.mockResolvedValue({ closedAt: new Date() });
    await repo.runAutomaticCycle();
    expect(tx.ledgerAutomationFailure.upsert).not.toHaveBeenCalled();
  });

  it('ne journalise pas un échec avec un acteur devenu inactif', async () => {
    jest.spyOn(repo, 'postSource').mockRejectedValue(new ConflictException('Conflit'));
    tx.user.findFirst.mockResolvedValue(null);
    await repo.runAutomaticCycle();
    expect(tx.ledgerAutomationFailure.upsert).not.toHaveBeenCalled();
  });

  it('enregistre un échec réel dans une transaction sérialisable sans détail technique', async () => {
    jest.spyOn(repo, 'postSource').mockRejectedValue(new Error('secret technique'));
    await repo.runAutomaticCycle();
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.ledgerAutomationFailure.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          periodId: item.periodId,
          sourceId: item.id,
          lastError: 'Échec technique de la comptabilisation automatique.',
        }),
      }),
    );
  });

  it('nettoie l’échec dans la transaction de répétition d’une écriture déjà validée', async () => {
    const entry = { id: 'entry', periodId: item.periodId, postedAt: new Date() };
    tx.ledgerEntry.findUnique.mockResolvedValue(entry);
    await expect(repo.runAutomaticCycle()).resolves.toEqual({ processed: 1, failed: 0 });
    expect(tx.ledgerAutomationFailure.deleteMany).toHaveBeenCalledWith({
      where: { periodId: item.periodId, sourceType: item.type, sourceId: item.id },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
