import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TreasuryRepository } from './treasury.repository';

describe('Protection des mouvements de caisse', () => {
  const tx = {
    user: { findFirst: jest.fn() },
    cashMovement: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    cashSession: { findUnique: jest.fn() },
  };
  const repo = new TreasuryRepository({
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.user.findFirst.mockResolvedValue({ id: 'actor' });
  });

  it('refuse de réutiliser un mouvement de dépense en mouvement manuel', async () => {
    tx.cashMovement.findUnique.mockResolvedValue({
      sessionId: 'session', amount: new Prisma.Decimal('-10'), reason: 'Dépense',
      actorId: 'actor', expensePayment: { id: 'expense' },
    });
    await expect(repo.move('session', '-10', 'Dépense', 'key', 'actor')).rejects.toThrow(ConflictException);
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });

  it('refuse un transfert historique avec un crédit différent du débit', async () => {
    tx.cashMovement.findUnique.mockResolvedValue({
      transferKey: 'key', sessionId: 'source', amount: new Prisma.Decimal('-10'), actorId: 'actor',
    });
    tx.cashMovement.findFirst.mockResolvedValue({
      sessionId: 'target', amount: new Prisma.Decimal('9'), actorId: 'actor',
    });
    await expect(repo.transfer('source', 'target', '10', 'key', 'actor')).rejects.toThrow(ConflictException);
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });
});
