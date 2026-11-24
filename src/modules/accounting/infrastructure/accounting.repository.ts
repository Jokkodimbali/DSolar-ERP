import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AccountingPort, PostingInput } from '../application/accounting.port';
import { assertBalanced, calendarDate } from '../domain/ledger-policy';

@Injectable()
export class AccountingRepository implements AccountingPort {
  constructor(private readonly prisma: PrismaService) {}

  private async transaction<T>(actor: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const user = await tx.user.findFirst({
            where: { id: actor, status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
          });
          if (!user) throw new ForbiddenException('Accès comptabilité interdit.');
          return work(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2003', 'P2034'].includes(error.code)
      )
        throw new ConflictException('Opération concurrente, référence invalide ou doublon.');
      throw error;
    }
  }

  private audit(tx: Prisma.TransactionClient, actorId: string, action: string, entityId: string) {
    return tx.auditLog.create({ data: { actorId, action, entityId, entityType: 'Accounting' } });
  }

  setup(actor: string) {
    return this.transaction(actor, async (tx) => ({
      accounts: await tx.ledgerAccount.findMany({ orderBy: { code: 'asc' } }),
      journals: await tx.ledgerJournal.findMany({ orderBy: { code: 'asc' } }),
      periods: await tx.ledgerPeriod.findMany({ orderBy: { startsAt: 'desc' } }),
    }));
  }

  account(code: string, name: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const result = await tx.ledgerAccount.create({ data: { code, name } });
      await this.audit(tx, actor, 'LEDGER_ACCOUNT_CREATED', result.id);
      return result;
    });
  }

  journal(code: string, name: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const result = await tx.ledgerJournal.create({ data: { code, name } });
      await this.audit(tx, actor, 'LEDGER_JOURNAL_CREATED', result.id);
      return result;
    });
  }

  period(name: string, start: string, end: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const startsAt = calendarDate(start);
      const endsAt = calendarDate(end);
      if (startsAt > endsAt) throw new ConflictException('Période invalide.');
      if (
        await tx.ledgerPeriod.findFirst({ where: { startsAt: { lte: endsAt }, endsAt: { gte: startsAt } } })
      )
        throw new ConflictException('Périodes comptables chevauchantes.');
      const result = await tx.ledgerPeriod.create({ data: { name, startsAt, endsAt } });
      await this.audit(tx, actor, 'LEDGER_PERIOD_CREATED', result.id);
      return result;
    });
  }

  close(id: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const period = await tx.ledgerPeriod.findUnique({ where: { id } });
      if (!period) throw new NotFoundException('Période introuvable.');
      if (period.closedAt) return period;
      if (await tx.ledgerEntry.count({ where: { periodId: id, postedAt: null } }))
        throw new ConflictException('Écritures non validées.');
      const result = await tx.ledgerPeriod.update({
        where: { id },
        data: { closedAt: new Date(), closedBy: actor },
      });
      await this.audit(tx, actor, 'LEDGER_PERIOD_CLOSED', id);
      return result;
    });
  }

  private async write(
    tx: Prisma.TransactionClient,
    input: PostingInput,
    actor: string,
    reversalOfId?: string,
  ) {
    try {
      assertBalanced(input.lines);
    } catch {
      throw new ConflictException('Écriture invalide ou déséquilibrée.');
    }
    const date = calendarDate(input.date);
    const previous = await tx.ledgerEntry.findUnique({
      where: { operationKey: input.operationKey },
      include: { lines: true },
    });
    if (previous) {
      const signature = (
        lines: { accountId: string; debit: string | Prisma.Decimal; credit: string | Prisma.Decimal }[],
      ) =>
        lines
          .map((line) =>
            [
              line.accountId,
              new Prisma.Decimal(line.debit).toFixed(2),
              new Prisma.Decimal(line.credit).toFixed(2),
            ].join(':'),
          )
          .sort()
          .join('|');
      if (
        previous.actorId !== actor ||
        previous.periodId !== input.periodId ||
        previous.journalId !== input.journalId ||
        previous.date.getTime() !== date.getTime() ||
        previous.description !== input.description ||
        previous.reversalOfId !== (reversalOfId ?? null) ||
        !previous.postedAt ||
        signature(previous.lines) !== signature(input.lines)
      )
        throw new ConflictException('Clé opération déjà utilisée.');
      return previous;
    }
    const period = await tx.ledgerPeriod.findUnique({ where: { id: input.periodId } });
    if (!period || period.closedAt || date < period.startsAt || date > period.endsAt)
      throw new ConflictException('Période clôturée ou date hors période.');
    if (!(await tx.ledgerJournal.findUnique({ where: { id: input.journalId } })))
      throw new NotFoundException('Journal introuvable.');
    const ids = [...new Set(input.lines.map((line) => line.accountId))];
    if ((await tx.ledgerAccount.count({ where: { id: { in: ids } } })) !== ids.length)
      throw new NotFoundException('Compte introuvable.');
    const entry = await tx.ledgerEntry.create({
      data: {
        journalId: input.journalId,
        periodId: input.periodId,
        date,
        description: input.description,
        operationKey: input.operationKey,
        actorId: actor,
        reversalOfId,
      },
    });
    await tx.ledgerLine.createMany({ data: input.lines.map((line) => ({ ...line, entryId: entry.id })) });
    const posted = await tx.ledgerEntry.update({
      where: { id: entry.id },
      data: { postedAt: new Date() },
      include: { lines: true },
    });
    await this.audit(tx, actor, reversalOfId ? 'LEDGER_ENTRY_REVERSED' : 'LEDGER_ENTRY_POSTED', entry.id);
    return posted;
  }

  post(input: PostingInput, actor: string) {
    return this.transaction(actor, (tx) => this.write(tx, input, actor));
  }

  reverse(id: string, periodId: string, date: string, reason: string, key: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const original = await tx.ledgerEntry.findUnique({ where: { id }, include: { lines: true } });
      if (!original?.postedAt || original.reversalOfId || calendarDate(date) < original.date)
        throw new ConflictException('Écriture non contrepassable.');
      return this.write(
        tx,
        {
          journalId: original.journalId,
          periodId,
          date,
          description: reason,
          operationKey: key,
          lines: original.lines.map((line) => ({
            accountId: line.accountId,
            debit: line.credit.toFixed(2),
            credit: line.debit.toFixed(2),
          })),
        },
        actor,
        id,
      );
    });
  }

  entries(periodId: string, actor: string, accountId?: string, cursor?: string) {
    return this.transaction(actor, async (tx) => {
      if (!(await tx.ledgerPeriod.findUnique({ where: { id: periodId } })))
        throw new NotFoundException('Période introuvable.');
      const where: Prisma.LedgerEntryWhereInput = {
        periodId,
        postedAt: { not: null },
        ...(accountId ? { lines: { some: { accountId } } } : {}),
      };
      if (cursor && !(await tx.ledgerEntry.findFirst({ where: { ...where, id: cursor } })))
        throw new NotFoundException('Curseur invalide.');
      const entries = await tx.ledgerEntry.findMany({
        where,
        include: { lines: { include: { account: true } }, journal: true },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const page = entries.slice(0, 100);
      return { entries: page, nextCursor: entries.length > 100 ? page[99].id : null };
    });
  }

  trialBalance(periodId: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      if (!(await tx.ledgerPeriod.findUnique({ where: { id: periodId } })))
        throw new NotFoundException('Période introuvable.');
      const groups = await tx.ledgerLine.groupBy({
        by: ['accountId'],
        where: { entry: { periodId, postedAt: { not: null } } },
        _sum: { debit: true, credit: true },
      });
      const accounts = await tx.ledgerAccount.findMany({ orderBy: { code: 'asc' } });
      const byAccount = new Map(groups.map((group) => [group.accountId, group]));
      const rows = accounts.map((account) => {
        const group = byAccount.get(account.id);
        const debit = group?._sum.debit ?? new Prisma.Decimal(0);
        const credit = group?._sum.credit ?? new Prisma.Decimal(0);
        return { ...account, debit, credit, balance: debit.minus(credit) };
      });
      const debit = rows.reduce((sum, row) => sum.plus(row.debit), new Prisma.Decimal(0));
      const credit = rows.reduce((sum, row) => sum.plus(row.credit), new Prisma.Decimal(0));
      return { rows, debit, credit, balanced: debit.eq(credit) };
    });
  }
}
