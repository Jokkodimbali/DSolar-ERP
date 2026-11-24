import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AccountingRepository } from './accounting.repository';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;

integration('Comptabilité PostgreSQL', () => {
  it('protège les écritures, les périodes et les contrepassations', async () => {
    const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || 'invalid:');
    if (process.env.NODE_ENV !== 'test' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) ||
      url.pathname !== '/dsolar_test') throw new Error('Base locale de test requise.');
    const prisma = new PrismaService();
    const repo = new AccountingRepository(prisma);
    const suffix = randomUUID().slice(0, 8);
    try {
      const role = await prisma.role.upsert({
        where: { code: 'ADMIN' }, update: {}, create: { code: 'ADMIN', name: 'Administrateur' },
      });
      const admin = await prisma.user.create({
        data: { email: suffix + '-ledger@example.test', fullName: 'Admin CI', passwordHash: 'test',
          roles: { create: { roleId: role.id } } },
      });
      await expect(repo.setup(randomUUID())).rejects.toBeInstanceOf(ForbiddenException);
      const cash = await repo.account('57-' + suffix, 'Caisse', admin.id);
      const income = await repo.account('70-' + suffix, 'Produits', admin.id);
      const journal = await repo.journal('VE-' + suffix, 'Ventes', admin.id);
      const period = await repo.period('CI-' + suffix, '2090-01-01', '2090-12-31', admin.id);
      await expect(repo.period('overlap-' + suffix, '2090-12-31', '2091-01-01', admin.id)).rejects.toBeInstanceOf(ConflictException);
      const input = { journalId: journal.id, periodId: period.id, date: '2090-01-01', description: 'Vente CI',
        operationKey: randomUUID(), lines: [
          { accountId: cash.id, debit: '100.50', credit: '0' },
          { accountId: income.id, debit: '0', credit: '100.50' },
        ] };
      await expect(repo.post({ ...input, lines: [input.lines[0], { ...input.lines[1], credit: '90' }] }, admin.id)).rejects.toBeInstanceOf(ConflictException);
      const entry = await repo.post(input, admin.id);
      expect((await repo.post(input, admin.id)).id).toBe(entry.id);
      await expect(prisma.ledgerLine.update({ where: { id: entry.lines[0].id }, data: { debit: '1' } })).rejects.toThrow();
      await expect(prisma.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
      const balance = await repo.trialBalance(period.id, admin.id);
      expect(balance.balanced).toBe(true);
      expect(balance.debit.toString()).toBe('100.5');
      await repo.close(period.id, admin.id);
      await expect(repo.post({ ...input, operationKey: randomUUID() }, admin.id)).rejects.toBeInstanceOf(ConflictException);
      const next = await repo.period('CI-next-' + suffix, '2091-01-01', '2091-12-31', admin.id);
      const reversed = await repo.reverse(entry.id, next.id, '2091-01-01', 'Correction', randomUUID(), admin.id);
      expect(reversed.reversalOfId).toBe(entry.id);
      await expect(repo.reverse(entry.id, next.id, '2091-01-01', 'Correction', randomUUID(), admin.id)).rejects.toBeInstanceOf(ConflictException);
      expect((await repo.trialBalance(next.id, admin.id)).balanced).toBe(true);
      expect((await repo.entries(next.id, admin.id, cash.id)).entries).toHaveLength(1);
    } finally {
      await prisma.$disconnect();
    }
  }, 30000);
});
