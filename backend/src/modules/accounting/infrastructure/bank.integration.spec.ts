import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { assertLocalIntegrationDatabase } from '../../../infrastructure/prisma/local-integration-database';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AccountingRepository } from './accounting.repository';
import { BankRepository } from './bank.repository';
import { BankService } from '../application/bank.service';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;
integration('Rapprochement bancaire PostgreSQL', () => {
  it('contrôle les écarts, les doublons, la clôture et les écritures rétroactives', async () => {
    assertLocalIntegrationDatabase(process.env);
    const prisma = new PrismaService();
    const repo = new BankRepository(prisma);
    const bankService = new BankService(repo);
    const ledger = new AccountingRepository(prisma);
    const suffix = randomUUID().slice(0, 8);
    try {
      const role = await prisma.role.upsert({
        where: { code: 'ADMIN' },
        update: {},
        create: { code: 'ADMIN', name: 'Administrateur' },
      });
      const admin = await prisma.user.create({
        data: {
          email: suffix + '-bank@example.test',
          fullName: 'Admin CI',
          passwordHash: 'test',
          roles: { create: { roleId: role.id } },
        },
      });
      await expect(repo.accounts(randomUUID())).rejects.toBeInstanceOf(ForbiddenException);
      const asset = await ledger.account('52-' + suffix, 'Banque', admin.id);
      const revenue = await ledger.account('70B-' + suffix, 'Produits', admin.id);
      await ledger.classify(asset.id, 'ASSET', admin.id);
      await ledger.classify(revenue.id, 'REVENUE', admin.id);
      const bank = await repo.createAccount(asset.id, 'Banque CI', admin.id);
      const journal = await ledger.journal('BQ-' + suffix, 'Banque', admin.id);
      const period = await ledger.period('BANK-' + suffix, '2095-01-01', '2095-12-31', admin.id);
      const post = {
        journalId: journal.id,
        periodId: period.id,
        date: '2095-01-03',
        description: 'Encaissement',
        operationKey: randomUUID(),
        lines: [
          { accountId: asset.id, debit: '100.01', credit: '0' },
          { accountId: revenue.id, debit: '0', credit: '100.01' },
        ],
      };
      const entry = await ledger.post(post, admin.id);
      const ledgerLine = entry.lines.find((line) => line.accountId === asset.id)!;
      const input = {
        bankAccountId: bank.id,
        reference: 'RELEVE-' + suffix,
        start: '2095-01-01',
        end: '2095-01-31',
        opening: '0',
        closing: '100.01',
        lines: [{ reference: 'BANK-1', date: '2095-01-04', description: 'Encaissement', amount: '100.01' }],
      };
      await expect(repo.importStatement({ ...input, closing: '100' }, admin.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      const statement = await repo.importStatement(input, admin.id);
      await expect(repo.importStatement(input, admin.id)).resolves.toMatchObject({ id: statement.id });
      await expect(repo.importStatement({
        ...input,
        lines: [{ ...input.lines[0], description: 'Autre libellé' }],
      }, admin.id)).rejects.toBeInstanceOf(ConflictException);
      await expect(repo.importStatement({ ...input, reference: 'DUP' }, admin.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      const line = statement.lines[0];
      await expect(bankService.suggestions(statement.id, randomUUID())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const suggestions = await bankService.suggestions(statement.id, admin.id);
      expect(suggestions).toMatchObject({ unique: 1, ambiguous: 0, noMatch: 0 });
      expect(suggestions.items[0]).toMatchObject({
        bankLineId: line.id,
        status: 'UNIQUE',
        candidates: [{ ledgerLineId: ledgerLine.id, daysApart: 1 }],
      });
      expect(
        (await prisma.ledgerBankLine.findUniqueOrThrow({ where: { id: line.id } })).ledgerLineId,
      ).toBeNull();
      await expect(repo.close(statement.id, admin.id)).rejects.toBeInstanceOf(ConflictException);
      await expect(
        repo.match(line.id, entry.lines.find((item) => item.accountId === revenue.id)!.id, admin.id),
      ).rejects.toBeInstanceOf(ConflictException);
      await repo.match(line.id, ledgerLine.id, admin.id);
      expect((await repo.detail(statement.id, admin.id)).balanced).toBe(true);
      expect((await bankService.suggestions(statement.id, admin.id)).total).toBe(0);
      expect((await repo.detail(statement.id, admin.id)).invalidMatches).toBe(0);
      await expect(repo.match(line.id, ledgerLine.id, admin.id)).resolves.toMatchObject({
        ledgerLineId: ledgerLine.id,
      });
      await repo.unmatch(line.id, admin.id);
      expect((await repo.detail(statement.id, admin.id)).balanced).toBe(false);
      await repo.match(line.id, ledgerLine.id, admin.id);
      await repo.close(statement.id, admin.id);
      await expect(bankService.suggestions(statement.id, admin.id)).rejects.toBeInstanceOf(ConflictException);
      await expect(repo.unmatch(line.id, admin.id)).rejects.toBeInstanceOf(ConflictException);
      await expect(ledger.post({ ...post, operationKey: randomUUID() }, admin.id)).rejects.toThrow();
      expect(await prisma.ledgerEntry.count({ where: { periodId: period.id } })).toBe(1);
      expect((await repo.detail(statement.id, admin.id)).closingDifference).toBe('0.00');
    } finally {
      await prisma.$disconnect();
    }
  }, 30000);
});
