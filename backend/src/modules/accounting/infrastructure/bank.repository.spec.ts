import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { BankRepository } from './bank.repository';

describe('Cohérence des rapprochements historiques', () => {
  const date = new Date('2095-01-04');
  const bankLine = { id: 'bank-line', ledgerLineId: 'ledger-line', amount: new Prisma.Decimal('100') };
  const statement = {
    id: 'statement',
    bankAccount: { accountId: 'asset' },
    startsAt: new Date('2095-01-01'),
    endsAt: new Date('2095-01-31'),
    opening: new Prisma.Decimal('0'),
    closing: new Prisma.Decimal('100'),
    closedAt: null,
    lines: [bankLine],
  };
  const ledgerLine = {
    id: 'ledger-line',
    accountId: 'asset',
    debit: new Prisma.Decimal('100'),
    credit: new Prisma.Decimal('0'),
    entry: { date, postedAt: date },
    bankMatch: { id: 'bank-line' },
  };
  const tx = {
    user: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    ledgerBankStatement: { findUnique: jest.fn(), update: jest.fn() },
    ledgerLine: { findMany: jest.fn(), findUnique: jest.fn() },
    ledgerBankLine: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const repo = new BankRepository({
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    tx.user.findFirst.mockResolvedValue({ id: 'admin' });
    tx.$queryRaw.mockResolvedValue([{ opening: '0', closing: '100' }]);
    tx.ledgerBankStatement.findUnique.mockResolvedValue(statement);
    tx.ledgerBankLine.findUnique.mockResolvedValue({ ...bankLine, statement });
    tx.ledgerLine.findUnique.mockResolvedValue(ledgerLine);
  });

  it('considère un rapprochement historique exact comme équilibré', async () => {
    tx.ledgerLine.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([ledgerLine]);
    await expect(repo.detail('statement', 'admin')).resolves.toMatchObject({
      balanced: true,
      invalidMatches: 0,
    });
  });

  it.each([
    { lines: [] },
    { lines: [{ ...ledgerLine, accountId: 'other' }] },
    { lines: [{ ...ledgerLine, debit: new Prisma.Decimal('99') }] },
    { lines: [{ ...ledgerLine, entry: { ...ledgerLine.entry, postedAt: null } }] },
    { lines: [{ ...ledgerLine, entry: { ...ledgerLine.entry, date: new Date('2095-02-01') } }] },
  ])('bloque une clôture avec un rapprochement historique invalide %#', async ({ lines }) => {
    tx.ledgerLine.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(lines);
    await expect(repo.close('statement', 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.ledgerBankStatement.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('revalide une correspondance lors d’une répétition idempotente', async () => {
    tx.ledgerLine.findUnique.mockResolvedValue({ ...ledgerLine, debit: new Prisma.Decimal('99') });
    await expect(repo.match('bank-line', 'ledger-line', 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.ledgerBankLine.update).not.toHaveBeenCalled();
  });

  it('ne modifie pas une correspondance répétée et valide', async () => {
    await expect(repo.match('bank-line', 'ledger-line', 'admin')).resolves.toMatchObject(bankLine);
    expect(tx.ledgerBankLine.update).not.toHaveBeenCalled();
  });
});
