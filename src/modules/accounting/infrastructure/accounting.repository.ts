import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AccountingPort, PostingInput } from '../application/accounting.port';
import { aggregateCents, assertBalanced, calendarDate, moneyText } from '../domain/ledger-policy';
import { PostingRuleInput, SourceType, validRuleKey } from '../domain/source-types';
import { buildSourcePosting } from './source-posting';
import { pendingSources } from './pending-sources';

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
      rules: await tx.ledgerPostingRule.findMany({ orderBy: { key: 'asc' } }),
      accounts: await tx.ledgerAccount.findMany({ orderBy: { code: 'asc' } }),
      journals: await tx.ledgerJournal.findMany({ orderBy: { code: 'asc' } }),
      periods: await tx.ledgerPeriod.findMany({ orderBy: { startsAt: 'desc' } }),
    }));
  }

  rule(input: PostingRuleInput, actor: string) {
    return this.transaction(actor, async (tx) => {
      if (!validRuleKey(input.key)) throw new ConflictException('Clé de règle invalide.');
      const ids = [
        input.debitAccountId,
        input.creditAccountId,
        ...(input.taxAccountId ? [input.taxAccountId] : []),
      ];
      if (new Set(ids).size !== ids.length || (input.taxAccountId && input.key !== 'INVOICE'))
        throw new ConflictException('Imputation invalide.');
      if ((await tx.ledgerAccount.count({ where: { id: { in: ids } } })) !== ids.length)
        throw new NotFoundException('Compte introuvable.');
      if (!(await tx.ledgerJournal.findUnique({ where: { id: input.journalId } })))
        throw new NotFoundException('Journal introuvable.');
      const data = {
        journalId: input.journalId,
        debitAccountId: input.debitAccountId,
        creditAccountId: input.creditAccountId,
        taxAccountId: input.taxAccountId ?? null,
      };
      const rule = await tx.ledgerPostingRule.upsert({
        where: { key: input.key },
        update: data,
        create: { key: input.key, ...data },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor,
          action: 'LEDGER_RULE_UPDATED',
          entityType: 'Accounting',
          entityId: input.key,
          payload: data,
        },
      });
      return rule;
    });
  }

  postSource(type: SourceType, id: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const previous = await tx.ledgerEntry.findUnique({
        where: { sourceType_sourceId: { sourceType: type, sourceId: id } },
        include: { lines: true },
      });
      if (previous?.postedAt) return previous;
      if (previous) throw new ConflictException('Écriture source non validée.');
      const posting = await buildSourcePosting(tx, type, id);
      const date = posting.date.toISOString().slice(0, 10);
      const day = calendarDate(date);
      const period = await tx.ledgerPeriod.findFirst({
        where: { startsAt: { lte: day }, endsAt: { gte: day }, closedAt: null },
      });
      if (!period) throw new ConflictException('Aucune période ouverte à la date de la pièce.');
      return this.write(
        tx,
        {
          journalId: posting.journalId,
          periodId: period.id,
          date,
          description: posting.description,
          operationKey: randomUUID(),
          lines: posting.lines,
        },
        actor,
        posting.reversalOfId,
        { sourceType: type, sourceId: id },
      );
    });
  }

  pending(periodId: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const period = await tx.ledgerPeriod.findUnique({ where: { id: periodId } });
      if (!period) throw new NotFoundException('Période introuvable.');
      const rows = await pendingSources(tx, period.startsAt, period.endsAt, 101);
      return { periodId, closed: !!period.closedAt, items: rows.slice(0, 100), hasMore: rows.length > 100 };
    });
  }

  async postPending(periodId: string, actor: string) {
    const pending = await this.pending(periodId, actor);
    if (pending.closed) throw new ConflictException('Période clôturée.');
    const results: { type: SourceType; id: string; entryId?: string; error?: string }[] = [];
    // Each source gets an independent serializable transaction, allowing progress despite a missing rule.
    for (const item of pending.items.slice(0, 25)) {
      try {
        const entry = await this.postSource(item.type, item.id, actor);
        results.push({ type: item.type, id: item.id, entryId: entry.id });
      } catch (error) {
        if (!(error instanceof HttpException) || ![404, 409].includes(error.getStatus())) throw error;
        results.push({ type: item.type, id: item.id, error: error.message });
      }
    }
    return { results, remaining: await this.pending(periodId, actor) };
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
      if ((await pendingSources(tx, period.startsAt, period.endsAt, 1)).length)
        throw new ConflictException('Des pièces métier restent à comptabiliser.');
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
    source?: { sourceType: SourceType; sourceId: string },
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
        previous.sourceType !== (source?.sourceType ?? null) ||
        previous.sourceId !== (source?.sourceId ?? null) ||
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
        ...source,
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
      if (
        !original?.postedAt ||
        original.reversalOfId ||
        original.sourceType ||
        calendarDate(date) < original.date
      )
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
        const debit = aggregateCents(group?._sum.debit?.toFixed(2) ?? '0');
        const credit = aggregateCents(group?._sum.credit?.toFixed(2) ?? '0');
        return { ...account, debit: moneyText(debit), credit: moneyText(credit), balance: moneyText(debit - credit) };
      });
      const debit = rows.reduce((sum, row) => sum + aggregateCents(row.debit), 0n);
      const credit = rows.reduce((sum, row) => sum + aggregateCents(row.credit), 0n);
      return { rows, debit: moneyText(debit), credit: moneyText(credit), balanced: debit === credit };
    });
  }
}
