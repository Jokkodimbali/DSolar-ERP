import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AccountingRepository } from './accounting.repository';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;

integration('Comptabilité PostgreSQL', () => {
  it('protège les écritures, les périodes et les contrepassations', async () => {
    const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map(
      (value) => new URL(value || 'invalid:'),
    );
    if (
      process.env.NODE_ENV !== 'test' ||
      urls.some(
        (url) =>
          !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
          url.pathname !== '/dsolar_test' ||
          !['postgres:', 'postgresql:'].includes(url.protocol),
      )
    )
      throw new Error('Base locale de test requise.');
    const prisma = new PrismaService();
    const repo = new AccountingRepository(prisma);
    const suffix = randomUUID().slice(0, 8);
    try {
      const role = await prisma.role.upsert({
        where: { code: 'ADMIN' },
        update: {},
        create: { code: 'ADMIN', name: 'Administrateur' },
      });
      const admin = await prisma.user.create({
        data: {
          email: suffix + '-ledger@example.test',
          fullName: 'Admin CI',
          passwordHash: 'test',
          roles: { create: { roleId: role.id } },
        },
      });
      await expect(repo.setup(randomUUID())).rejects.toBeInstanceOf(ForbiddenException);
      const cash = await repo.account('57-' + suffix, 'Caisse', admin.id);
      const income = await repo.account('70-' + suffix, 'Produits', admin.id);
      const journal = await repo.journal('VE-' + suffix, 'Ventes', admin.id);
      const period = await repo.period('CI-' + suffix, '2090-01-01', '2090-12-31', admin.id);
      await expect(
        repo.period('overlap-' + suffix, '2090-12-31', '2091-01-01', admin.id),
      ).rejects.toBeInstanceOf(ConflictException);
      const input = {
        journalId: journal.id,
        periodId: period.id,
        date: '2090-01-01',
        description: 'Vente CI',
        operationKey: randomUUID(),
        lines: [
          { accountId: cash.id, debit: '100.50', credit: '0' },
          { accountId: income.id, debit: '0', credit: '100.50' },
        ],
      };
      await expect(
        repo.post({ ...input, lines: [input.lines[0], { ...input.lines[1], credit: '90' }] }, admin.id),
      ).rejects.toBeInstanceOf(ConflictException);
      const entry = await repo.post(input, admin.id);
      expect((await repo.post(input, admin.id)).id).toBe(entry.id);
      await expect(
        prisma.ledgerLine.update({ where: { id: entry.lines[0].id }, data: { debit: '1' } }),
      ).rejects.toThrow();
      await expect(prisma.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
      const balance = await repo.trialBalance(period.id, admin.id);
      expect(balance.balanced).toBe(true);
      expect(balance.debit).toBe('100.50');
      const customer = await prisma.customer.create({ data: { name: 'Client comptabilité CI' } });
      const invoice = await prisma.invoice.create({
        data: {
          number: 'FAC-' + suffix,
          customerId: customer.id,
          status: 'ISSUED',
          issuedAt: new Date('2090-01-02T12:00:00Z'),
          totalHt: '100',
          totalTax: '18',
          totalTtc: '118',
        },
      });
      await expect(repo.postSource('INVOICE', invoice.id, admin.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      const tax = await repo.account('44-' + suffix, 'Taxe collectée', admin.id);
      await repo.rule(
        {
          key: 'INVOICE',
          journalId: journal.id,
          debitAccountId: cash.id,
          creditAccountId: income.id,
          taxAccountId: tax.id,
        },
        admin.id,
      );
      const booked = await repo.postSource('INVOICE', invoice.id, admin.id);
      expect(booked.lines).toHaveLength(3);
      expect(booked.lines.find((line) => line.accountId === tax.id)?.credit.toString()).toBe('18');
      expect((await repo.postSource('INVOICE', invoice.id, admin.id)).id).toBe(booked.id);
      await expect(
        repo.reverse(booked.id, period.id, '2090-01-03', 'Correction', randomUUID(), admin.id),
      ).rejects.toBeInstanceOf(ConflictException);
      const note = await prisma.creditNote.create({
        data: {
          number: 'AV-' + suffix,
          invoiceId: invoice.id,
          amount: '118',
          reason: 'Correction complète CI',
          issuedAt: new Date('2090-01-03T12:00:00Z'),
        },
      });
      const partial = await prisma.creditNote.create({
        data: {
          number: 'AV-P-' + suffix,
          invoiceId: invoice.id,
          amount: '1',
          reason: 'Avoir partiel CI',
          issuedAt: new Date('2090-01-03T12:00:00Z'),
        },
      });
      await expect(repo.postSource('CREDIT_NOTE', partial.id, admin.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      const credit = await repo.postSource('CREDIT_NOTE', note.id, admin.id);
      expect(credit.lines.find((line) => line.accountId === tax.id)?.debit.toString()).toBe('18');
      expect((await repo.postSource('CREDIT_NOTE', note.id, admin.id)).id).toBe(credit.id);

      const store = await prisma.store.create({ data: { code: 'LED-' + suffix, name: 'CI' } });
      const sourceRegister = await prisma.cashRegister.create({
        data: { storeId: store.id, name: 'Caisse A' },
      });
      const targetRegister = await prisma.cashRegister.create({
        data: { storeId: store.id, name: 'Caisse B' },
      });
      const sourceSession = await prisma.cashSession.create({
        data: { registerId: sourceRegister.id, opening: '100', openedBy: admin.id },
      });
      const targetSession = await prisma.cashSession.create({
        data: { registerId: targetRegister.id, opening: '0', openedBy: admin.id },
      });
      const transferKey = randomUUID();
      const debitMovement = await prisma.cashMovement.create({
        data: {
          sessionId: sourceSession.id,
          amount: '-25',
          reason: 'Transfert sortant',
          operationKey: transferKey,
          transferKey,
          actorId: admin.id,
          createdAt: new Date('2090-01-04T12:00:00Z'),
        },
      });
      await prisma.cashMovement.create({
        data: {
          sessionId: targetSession.id,
          amount: '25',
          reason: 'Transfert entrant',
          operationKey: randomUUID(),
          transferKey,
          actorId: admin.id,
          createdAt: new Date('2090-01-04T12:00:00Z'),
        },
      });
      const targetCash = await repo.account('57B-' + suffix, 'Caisse B', admin.id);
      await repo.rule(
        {
          key: 'CASH_TRANSFER:' + sourceRegister.id + ':' + targetRegister.id,
          journalId: journal.id,
          debitAccountId: targetCash.id,
          creditAccountId: cash.id,
        },
        admin.id,
      );
      const transferred = await repo.postSource('CASH_TRANSFER', transferKey, admin.id);
      expect(transferred.lines.find((line) => line.accountId === targetCash.id)?.debit.toString()).toBe('25');
      expect((await repo.postSource('CASH_TRANSFER', transferKey, admin.id)).id).toBe(transferred.id);
      await expect(repo.postSource('CASH_MOVEMENT', debitMovement.id, admin.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      // A new movement may not be attached to an already published transfer.
      await expect(
        prisma.cashMovement.create({
          data: {
            sessionId: targetSession.id,
            amount: '1',
            reason: 'Ligne supplémentaire interdite',
            operationKey: randomUUID(),
            transferKey,
            actorId: admin.id,
            createdAt: new Date('2090-01-04T12:00:00Z'),
          },
        }),
      ).rejects.toThrow();
      expect(await prisma.cashMovement.count({ where: { transferKey } })).toBe(2);
      // A balanced but fictitious source entry must not be published.
      await expect(
        prisma.$transaction(async (tx) => {
          const fake = await tx.ledgerEntry.create({
            data: {
              journalId: journal.id,
              periodId: period.id,
              date: new Date('2090-01-04'),
              description: 'Source inexistante',
              operationKey: randomUUID(),
              actorId: admin.id,
              sourceType: 'INVOICE',
              sourceId: randomUUID(),
              lines: {
                create: [
                  { accountId: cash.id, debit: '1', credit: '0' },
                  { accountId: income.id, debit: '0', credit: '1' },
                ],
              },
            },
          });
          await tx.ledgerEntry.update({ where: { id: fake.id }, data: { postedAt: new Date() } });
        }),
      ).rejects.toThrow();
      await expect(
        prisma.ledgerPeriod.create({
          data: {
            name: 'CLOSED-' + suffix,
            startsAt: new Date('2180-01-01'),
            endsAt: new Date('2180-12-31'),
            closedAt: new Date(),
            closedBy: admin.id,
          },
        }),
      ).rejects.toThrow();
      const pending = await repo.pending(period.id, admin.id);
      expect(pending.items.some((item) => item.id === partial.id)).toBe(true);
      await expect(repo.close(period.id, admin.id)).rejects.toBeInstanceOf(ConflictException);
      const blocked = await repo.postPending(period.id, admin.id);
      expect(blocked.results.some((item) => item.id === partial.id && !!item.error)).toBe(true);
      // Remove the intentionally inconsistent test fixture, never a real issued credit.
      await prisma.creditNote.delete({ where: { id: partial.id } });
      const product = await prisma.product.create({
        data: { sku: 'FISC-' + suffix, name: 'Article fiscal CI' },
      });
      const detailedInvoice = await prisma.invoice.create({
        data: {
          number: 'FAC-FISC-' + suffix,
          customerId: customer.id,
          totalHt: '100',
          totalTax: '18',
          totalTtc: '118',
          lines: {
            create: [
              {
                productId: product.id,
                quantity: '1',
                unitPrice: '100',
                taxRate: '18',
                taxAmount: '18',
                lineTotal: '118',
              },
            ],
          },
        },
        include: { lines: true },
      });
      await prisma.invoice.update({
        where: { id: detailedInvoice.id },
        data: { status: 'ISSUED', issuedAt: new Date('2090-01-05T12:00:00Z') },
      });
      await repo.postSource('INVOICE', detailedInvoice.id, admin.id);
      const detailedCredit = await prisma.creditNote.create({
        data: {
          number: 'AV-FISC-' + suffix,
          invoiceId: detailedInvoice.id,
          amount: '59',
          netAmount: '50',
          taxAmount: '9',
          reason: 'Correction fiscale CI',
          issuedAt: new Date('2090-01-05T13:00:00Z'),
          lines: {
            create: [{ invoiceLineId: detailedInvoice.lines[0].id, netAmount: '50', taxAmount: '9' }],
          },
        },
      });
      const fiscalEntry = await repo.postSource('CREDIT_NOTE', detailedCredit.id, admin.id);
      expect(fiscalEntry.lines.find((line) => line.accountId === tax.id)?.debit.toString()).toBe('9');
      expect(fiscalEntry.lines.find((line) => line.accountId === income.id)?.debit.toString()).toBe('50');
      await expect(
        prisma.invoiceLine.update({ where: { id: detailedInvoice.lines[0].id }, data: { taxAmount: '1' } }),
      ).rejects.toThrow();
      // A direct database write must not falsify the tax allocation even if its total is balanced.
      await expect(
        prisma.creditNote.create({
          data: {
            number: 'AV-BAD-TAX-' + suffix,
            invoiceId: detailedInvoice.id,
            amount: '10.01',
            netAmount: '10',
            taxAmount: '0.01',
            reason: 'Ventilation incorrecte CI',
            issuedAt: new Date('2090-01-05T14:00:00Z'),
            lines: {
              create: [{ invoiceLineId: detailedInvoice.lines[0].id, netAmount: '10', taxAmount: '0.01' }],
            },
          },
        }),
      ).rejects.toThrow();
      expect(await prisma.creditNote.count({ where: { invoiceId: detailedInvoice.id } })).toBe(1);
      await expect(
        prisma.creditNote.create({
          data: {
            number: 'AV-BAD-LEGACY-' + suffix,
            invoiceId: detailedInvoice.id,
            amount: '1',
            reason: 'Avoir sans ventilation CI',
            issuedAt: new Date('2090-01-05T14:00:00Z'),
          },
        }),
      ).rejects.toThrow();
      const otherInvoice = await prisma.invoice.create({
        data: {
          number: 'FAC2-' + suffix,
          customerId: customer.id,
          status: 'ISSUED',
          issuedAt: new Date('2090-01-05T12:00:00Z'),
          totalHt: '0.01',
          totalTax: '0',
          totalTtc: '0.01',
        },
      });
      const batch = await repo.postPending(period.id, admin.id);
      expect(batch.results.some((item) => item.id === otherInvoice.id && !!item.entryId)).toBe(true);
      expect(batch.remaining.items).toHaveLength(0);
      expect((await repo.postPending(period.id, admin.id)).results).toHaveLength(0);
      // New issued documents without a date are rejected at the database boundary.
      await expect(
        prisma.invoice.create({
          data: {
            number: 'FAC-NODATE-' + suffix,
            customerId: customer.id,
            status: 'ISSUED',
            totalHt: '1',
            totalTax: '0',
            totalTtc: '1',
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.ledgerAccount.update({ where: { id: cash.id }, data: { code: 'MODIFIED-' + suffix } }),
      ).rejects.toThrow();
      await expect(
        prisma.ledgerJournal.update({ where: { id: journal.id }, data: { name: 'Modified' } }),
      ).rejects.toThrow();
      const concurrentInvoice = await prisma.invoice.create({
        data: {
          number: 'FAC-RACE-' + suffix,
          customerId: customer.id,
          status: 'ISSUED',
          issuedAt: new Date('2090-01-07T12:00:00Z'),
          totalHt: '2.01',
          totalTax: '0',
          totalTtc: '2.01',
        },
      });
      const results = await Promise.allSettled([
        repo.postSource('INVOICE', concurrentInvoice.id, admin.id),
        repo.postSource('INVOICE', concurrentInvoice.id, admin.id),
      ]);
      expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
      expect(
        await prisma.ledgerEntry.count({ where: { sourceType: 'INVOICE', sourceId: concurrentInvoice.id } }),
      ).toBe(1);
      const late = prisma.invoice.create({
        data: {
          number: 'FAC-CLOSE-RACE-' + suffix,
          customerId: customer.id,
          status: 'ISSUED',
          issuedAt: new Date('2090-01-08T12:00:00Z'),
          totalHt: '1',
          totalTax: '0',
          totalTtc: '1',
        },
      });
      const race = await Promise.allSettled([late, repo.close(period.id, admin.id)]);
      expect(race.every((result) => result.status === 'fulfilled')).toBe(false);
      const lateInvoice = await prisma.invoice.findUnique({ where: { number: 'FAC-CLOSE-RACE-' + suffix } });
      if (lateInvoice) {
        expect(
          (await prisma.ledgerPeriod.findUniqueOrThrow({ where: { id: period.id } })).closedAt,
        ).toBeNull();
        await repo.postSource('INVOICE', lateInvoice.id, admin.id);
      }
      await expect(
        prisma.invoice.update({
          where: { id: invoice.id },
          data: { totalHt: '101', totalTtc: '119' },
        }),
      ).rejects.toThrow();
      await repo.close(period.id, admin.id);
      await expect(
        prisma.invoice.create({
          data: {
            number: 'FAC-LATE-' + suffix,
            customerId: customer.id,
            status: 'ISSUED',
            issuedAt: new Date('2090-01-06T12:00:00Z'),
            totalHt: '1',
            totalTax: '0',
            totalTtc: '1',
          },
        }),
      ).rejects.toThrow();
      await expect(repo.post({ ...input, operationKey: randomUUID() }, admin.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      const next = await repo.period('CI-next-' + suffix, '2091-01-01', '2091-12-31', admin.id);
      await expect(
        prisma.$transaction(async (tx) => {
          const invalid = await tx.ledgerEntry.create({
            data: {
              journalId: journal.id,
              periodId: next.id,
              date: new Date('2091-01-01'),
              description: 'Contrepassation incorrecte',
              operationKey: randomUUID(),
              actorId: admin.id,
              reversalOfId: entry.id,
            },
          });
          await tx.ledgerLine.createMany({
            data: [
              { entryId: invalid.id, accountId: cash.id, debit: '0', credit: '1' },
              { entryId: invalid.id, accountId: income.id, debit: '1', credit: '0' },
            ],
          });
          await tx.ledgerEntry.update({ where: { id: invalid.id }, data: { postedAt: new Date() } });
        }),
      ).rejects.toThrow();
      const reversed = await repo.reverse(
        entry.id,
        next.id,
        '2091-01-01',
        'Correction',
        randomUUID(),
        admin.id,
      );
      expect(reversed.reversalOfId).toBe(entry.id);
      await expect(
        repo.reverse(entry.id, next.id, '2091-01-01', 'Correction', randomUUID(), admin.id),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await repo.trialBalance(next.id, admin.id)).balanced).toBe(true);
      expect((await repo.entries(next.id, admin.id, cash.id)).entries).toHaveLength(1);
      expect((await repo.statements(next.id, admin.id)).complete).toBe(false);
      await repo.classify(cash.id, 'ASSET', admin.id);
      await repo.classify(targetCash.id, 'ASSET', admin.id);
      await repo.classify(income.id, 'REVENUE', admin.id);
      await repo.classify(tax.id, 'LIABILITY', admin.id);
      await expect(repo.classify(cash.id, 'EXPENSE', admin.id)).rejects.toBeInstanceOf(ConflictException);
      const statements = await repo.statements(next.id, admin.id);
      expect(statements.complete).toBe(true);
      if (!statements.complete) throw new Error('Unclassified accounts');
      expect(statements.incomeStatement.result).toBe('-100.50');
      expect(statements.balanceSheet.balanced).toBe(true);
      expect(statements.provisional).toBe(true);
      const autoPeriod = await repo.period('CI-auto-' + suffix, '2098-01-01', '2098-12-31', admin.id);
      const autoInvoice = await prisma.invoice.create({
        data: {
          number: 'FAC-AUTO-' + suffix,
          customerId: customer.id,
          status: 'ISSUED',
          issuedAt: new Date('2098-01-02T12:00:00Z'),
          totalHt: '25.01',
          totalTax: '0',
          totalTtc: '25.01',
        },
      });
      expect((await repo.runAutomaticCycle()).processed).toBe(0);
      await repo.configureAutomation(autoPeriod.id, true, admin.id);
      expect((await repo.runAutomaticCycle()).processed).toBe(1);
      expect((await repo.runAutomaticCycle()).processed).toBe(0);
      expect(
        await prisma.ledgerEntry.count({ where: { sourceType: 'INVOICE', sourceId: autoInvoice.id } }),
      ).toBe(1);
      await repo.configureAutomation(autoPeriod.id, false, admin.id);
      const disabledInvoice = await prisma.invoice.create({
        data: {
          number: 'FAC-DISABLED-' + suffix,
          customerId: customer.id,
          status: 'ISSUED',
          issuedAt: new Date('2098-01-03T12:00:00Z'),
          totalHt: '1',
          totalTax: '0',
          totalTtc: '1',
        },
      });
      expect((await repo.runAutomaticCycle()).processed).toBe(0);
      expect(
        await prisma.ledgerEntry.count({ where: { sourceType: 'INVOICE', sourceId: disabledInvoice.id } }),
      ).toBe(0);
      await repo.postSource('INVOICE', disabledInvoice.id, admin.id);
      await repo.close(autoPeriod.id, admin.id);
      await expect(repo.configureAutomation(autoPeriod.id, true, admin.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    } finally {
      await prisma.$disconnect();
    }
  }, 30000);
});
