import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { BankPort } from '../application/bank.port';
import { BankStatementInput, validateStatement } from '../domain/bank-policy';
import { aggregateCents, calendarDate, moneyText } from '../domain/ledger-policy';

@Injectable()
export class BankRepository implements BankPort {
  constructor(private readonly prisma: PrismaService) {}

  private async transaction<T>(actor: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (
            !(await tx.user.findFirst({
              where: { id: actor, status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
            }))
          )
            throw new ForbiddenException('Accès rapprochement bancaire interdit.');
          return work(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2003', 'P2034'].includes(error.code)
      )
        throw new ConflictException('Doublon, référence invalide ou opération concurrente.');
      throw error;
    }
  }

  private audit(tx: Prisma.TransactionClient, actorId: string, action: string, entityId: string) {
    return tx.auditLog.create({ data: { actorId, action, entityId, entityType: 'BankReconciliation' } });
  }

  createAccount(accountId: string, name: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const account = await tx.ledgerAccount.findUnique({
        where: { id: accountId },
        include: { classification: true },
      });
      if (account?.classification?.category !== 'ASSET')
        throw new ConflictException('Compte d’actif classé obligatoire.');
      const bank = await tx.ledgerBankAccount.create({ data: { accountId, name } });
      await this.audit(tx, actor, 'BANK_ACCOUNT_CREATED', bank.id);
      return bank;
    });
  }

  accounts(actor: string) {
    return this.transaction(actor, (tx) =>
      tx.ledgerBankAccount.findMany({ include: { account: true }, orderBy: { name: 'asc' } }),
    );
  }

  importStatement(input: BankStatementInput, actor: string) {
    return this.transaction(actor, async (tx) => {
      try {
        validateStatement(input);
      } catch {
        throw new ConflictException('Relevé invalide ou déséquilibré.');
      }
      const startsAt = calendarDate(input.start);
      const endsAt = calendarDate(input.end);
      const bank = await tx.ledgerBankAccount.findUnique({ where: { id: input.bankAccountId } });
      if (!bank) throw new NotFoundException('Compte bancaire introuvable.');
      const existing = await tx.ledgerBankStatement.findUnique({
        where: { bankAccountId_reference: { bankAccountId: bank.id, reference: input.reference } },
        include: { lines: true },
      });
      if (existing) {
        const matches =
          existing.startsAt.getTime() === startsAt.getTime() &&
          existing.endsAt.getTime() === endsAt.getTime() &&
          existing.opening.eq(input.opening) &&
          existing.closing.eq(input.closing) &&
          existing.lines.length === input.lines.length &&
          input.lines.every((line) =>
            existing.lines.some((saved) =>
              saved.reference === line.reference &&
              saved.date.getTime() === calendarDate(line.date).getTime() &&
              saved.description === line.description &&
              saved.amount.eq(line.amount),
            ),
          );
        if (!matches) throw new ConflictException('Référence de relevé déjà utilisée avec des données différentes.');
        return existing;
      }
      if (
        await tx.ledgerBankStatement.findFirst({
          where: { bankAccountId: bank.id, startsAt: { lte: endsAt }, endsAt: { gte: startsAt } },
        })
      )
        throw new ConflictException('Relevé bancaire chevauchant une période existante.');
      const result = await tx.ledgerBankStatement.create({
        data: {
          bankAccountId: bank.id,
          reference: input.reference,
          startsAt,
          endsAt,
          opening: input.opening,
          closing: input.closing,
          createdBy: actor,
          lines: { create: input.lines.map((line) => ({ ...line, date: calendarDate(line.date) })) },
        },
        include: { lines: true },
      });
      await this.audit(tx, actor, 'BANK_STATEMENT_IMPORTED', result.id);
      return result;
    });
  }

  statements(bankAccountId: string, actor: string) {
    return this.transaction(actor, (tx) =>
      tx.ledgerBankStatement.findMany({
        where: { bankAccountId },
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        take: 100,
      }),
    );
  }

  private async report(tx: Prisma.TransactionClient, id: string) {
    const statement = await tx.ledgerBankStatement.findUnique({
      where: { id },
      include: { bankAccount: true, lines: { orderBy: [{ date: 'asc' }, { id: 'asc' }] } },
    });
    if (!statement) throw new NotFoundException('Relevé introuvable.');
    const [balances] = await tx.$queryRaw<{ opening: string; closing: string }[]>`
      SELECT coalesce(sum(l.debit-l.credit) FILTER (WHERE e.date < ${statement.startsAt}::date),0)::text AS opening,
        coalesce(sum(l.debit-l.credit),0)::text AS closing
      FROM "LedgerLine" l JOIN "LedgerEntry" e ON e.id = l."entryId"
      WHERE l."accountId" = ${statement.bankAccount.accountId}::uuid
        AND e."postedAt" IS NOT NULL AND e.date <= ${statement.endsAt}::date
    `;
    const unmatched = await tx.ledgerLine.findMany({
      where: {
        accountId: statement.bankAccount.accountId,
        entry: { postedAt: { not: null }, date: { gte: statement.startsAt, lte: statement.endsAt } },
        bankMatch: null,
      },
      include: { entry: { select: { date: true, description: true, journalId: true } } },
      orderBy: [{ entry: { date: 'asc' } }, { id: 'asc' }],
      take: 501,
    });
    const matchedBankLines = statement.lines.filter((line) => line.ledgerLineId !== null);
    const matchedLedgerLines = await tx.ledgerLine.findMany({
      where: { id: { in: matchedBankLines.map((line) => line.ledgerLineId!) } },
      select: {
        id: true,
        accountId: true,
        debit: true,
        credit: true,
        entry: { select: { postedAt: true, date: true } },
      },
    });
    const byId = new Map(matchedLedgerLines.map((line) => [line.id, line]));
    const invalidMatches = matchedBankLines.filter((bankLine) => {
      const line = byId.get(bankLine.ledgerLineId!);
      return (
        !line ||
        !line.entry.postedAt ||
        line.accountId !== statement.bankAccount.accountId ||
        line.entry.date < statement.startsAt ||
        line.entry.date > statement.endsAt ||
        !line.debit.minus(line.credit).eq(bankLine.amount)
      );
    }).length;
    const unmatchedBank = statement.lines.filter((line) => !line.ledgerLineId).length;
    const openingDifference = aggregateCents(balances.opening) - aggregateCents(statement.opening.toFixed(2));
    const closingDifference = aggregateCents(balances.closing) - aggregateCents(statement.closing.toFixed(2));
    const bankTotal = statement.lines.reduce(
      (sum, line) => sum + aggregateCents(line.amount.toFixed(2)),
      aggregateCents(statement.opening.toFixed(2)),
    );
    const bankDifference = bankTotal - aggregateCents(statement.closing.toFixed(2));
    return {
      statement,
      bookOpening: moneyText(aggregateCents(balances.opening)),
      bookClosing: moneyText(aggregateCents(balances.closing)),
      openingDifference: moneyText(openingDifference),
      closingDifference: moneyText(closingDifference),
      bankDifference: moneyText(bankDifference),
      unmatchedBank,
      invalidMatches,
      unmatchedLedger: unmatched.slice(0, 500),
      hasMoreLedger: unmatched.length > 500,
      balanced:
        openingDifference === 0n &&
        closingDifference === 0n &&
        bankDifference === 0n &&
        unmatchedBank === 0 &&
        invalidMatches === 0 &&
        unmatched.length === 0,
    };
  }

  detail(id: string, actor: string) {
    return this.transaction(actor, (tx) => this.report(tx, id));
  }

  suggestionSnapshot(id: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const statement = await tx.ledgerBankStatement.findUnique({
        where: { id },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          closedAt: true,
          bankAccount: { select: { accountId: true } },
          lines: {
            where: { ledgerLineId: null },
            orderBy: [{ date: 'asc' }, { id: 'asc' }],
            select: { id: true, date: true, amount: true, description: true },
          },
        },
      });
      if (!statement) throw new NotFoundException('Relevé introuvable.');
      if (statement.closedAt) throw new ConflictException('Rapprochement clôturé.');
      const bankLines = statement.lines.map((line) => ({
        ...line,
        amount: line.amount.toFixed(2),
      }));
      if (!bankLines.length) return { statementId: id, bankLines, ledgerLines: [] };
      // Never present a truncated candidate set as a unique match.
      const rows = await tx.ledgerLine.findMany({
        where: {
          accountId: statement.bankAccount.accountId,
          bankMatch: null,
          entry: { postedAt: { not: null }, date: { gte: statement.startsAt, lte: statement.endsAt } },
        },
        select: {
          id: true,
          debit: true,
          credit: true,
          entry: { select: { date: true, description: true } },
        },
        orderBy: [{ entry: { date: 'asc' } }, { id: 'asc' }],
        take: 5001,
      });
      if (rows.length > 5000)
        throw new ConflictException('Trop d’écritures non rapprochées pour une suggestion fiable.');
      return {
        statementId: id,
        bankLines,
        ledgerLines: rows.map((line) => ({
          id: line.id,
          date: line.entry.date,
          description: line.entry.description,
          amount: line.debit.minus(line.credit).toFixed(2),
        })),
      };
    });
  }

  match(id: string, ledgerLineId: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const bankLine = await tx.ledgerBankLine.findUnique({
        where: { id },
        include: { statement: { include: { bankAccount: true } } },
      });
      if (!bankLine) throw new NotFoundException('Ligne bancaire introuvable.');
      if (bankLine.statement.closedAt) throw new ConflictException('Rapprochement clôturé.');
      if (bankLine.ledgerLineId && bankLine.ledgerLineId !== ledgerLineId)
        throw new ConflictException('Annuler le rapprochement existant avant modification.');
      const line = await tx.ledgerLine.findUnique({
        where: { id: ledgerLineId },
        include: { entry: true, bankMatch: true },
      });
      if (
        !line ||
        !line.entry.postedAt ||
        (line.bankMatch && line.bankMatch.id !== id) ||
        line.accountId !== bankLine.statement.bankAccount.accountId ||
        line.entry.date < bankLine.statement.startsAt ||
        line.entry.date > bankLine.statement.endsAt ||
        !line.debit.minus(line.credit).eq(bankLine.amount)
      )
        throw new ConflictException('Écriture incompatible ou déjà rapprochée.');
      if (bankLine.ledgerLineId === ledgerLineId) return bankLine;
      const result = await tx.ledgerBankLine.update({
        where: { id },
        data: { ledgerLineId, matchedBy: actor, matchedAt: new Date() },
      });
      await this.audit(tx, actor, 'BANK_LINE_MATCHED', id);
      return result;
    });
  }

  unmatch(id: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const line = await tx.ledgerBankLine.findUnique({ where: { id }, include: { statement: true } });
      if (!line) throw new NotFoundException('Ligne bancaire introuvable.');
      if (line.statement.closedAt) throw new ConflictException('Rapprochement clôturé.');
      if (!line.ledgerLineId) return line;
      const result = await tx.ledgerBankLine.update({
        where: { id },
        data: { ledgerLineId: null, matchedBy: null, matchedAt: null },
      });
      await this.audit(tx, actor, 'BANK_LINE_UNMATCHED', id);
      return result;
    });
  }

  close(id: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const report = await this.report(tx, id);
      if (report.statement.closedAt) return report.statement;
      if (!report.balanced) throw new ConflictException('Écarts ou mouvements non rapprochés.');
      const result = await tx.ledgerBankStatement.update({
        where: { id },
        data: { closedAt: new Date(), closedBy: actor },
      });
      await this.audit(tx, actor, 'BANK_RECONCILIATION_CLOSED', id);
      return result;
    });
  }
}
