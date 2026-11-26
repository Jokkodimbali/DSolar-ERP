import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { pageBounds, pageResult } from '../../../shared/pagination';
import { ExpenseCriteria, ExpensePayment, ExpensesPort, NewExpense } from '../application/expenses.port';
import { validCashAmount } from '../../treasury/domain/cash-amount';

@Injectable()
export class ExpensesRepository implements ExpensesPort {
  constructor(private readonly prisma: PrismaService) {}

  private async transaction<T>(actor: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const user = await tx.user.findFirst({
            where: { id: actor, status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
          });
          if (!user) throw new ForbiddenException('Accès dépenses interdit.');
          return work(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))
        throw new ConflictException('Opération concurrente ou déjà enregistrée.');
      throw error;
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    entityId: string,
    storeId?: string,
  ) {
    await tx.auditLog.create({ data: { actorId, action, entityId, storeId, entityType: 'Expense' } });
  }

  categories(actor: string) {
    return this.transaction(actor, (tx) => tx.expenseCategory.findMany({ orderBy: { name: 'asc' } }));
  }

  createCategory(name: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const category = await tx.expenseCategory.create({ data: { name } });
      await this.audit(tx, actor, 'EXPENSE_CATEGORY_CREATED', category.id);
      return category;
    });
  }

  list(actor: string, storeId?: string) {
    return this.transaction(actor, (tx) =>
      tx.expense.findMany({
        where: { storeId },
        include: { category: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
    );
  }

  search(actor: string, query: ExpenseCriteria) {
    const { page, limit, skip } = pageBounds(query);
    const search = query.search?.trim();
    const contains = search ? { contains: search, mode: 'insensitive' as const } : undefined;
    const where: Prisma.ExpenseWhereInput = {
      storeId: query.storeId,
      status: query.status,
      ...(contains ? {
        OR: [
          { description: contains },
          { reference: contains },
          { category: { name: contains } },
          { store: { name: contains } },
        ],
      } : {}),
    };
    return this.transaction(actor, async (tx) => {
      const [items, total] = await Promise.all([
        tx.expense.findMany({
          where,
          include: { category: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
        }),
        tx.expense.count({ where }),
      ]);
      return pageResult(items, total, page, limit);
    });
  }

  create(input: NewExpense, actor: string) {
    return this.transaction(actor, async (tx) => {
      if (!validCashAmount(input.amount, false, false))
        throw new ConflictException('Montant de dépense invalide.');
      const existing = await tx.expense.findUnique({ where: { operationKey: input.operationKey } });
      if (existing) {
        if (
          existing.createdBy !== actor ||
          existing.storeId !== input.storeId ||
          existing.categoryId !== input.categoryId ||
          existing.description !== input.description ||
          !existing.amount.eq(input.amount)
        )
          throw new ConflictException('Clé opération déjà utilisée.');
        return existing;
      }
      const store = await tx.store.findFirst({ where: { id: input.storeId, status: 'ACTIVE' } });
      const category = await tx.expenseCategory.findUnique({ where: { id: input.categoryId } });
      if (!store || !category) throw new NotFoundException('Magasin actif ou catégorie introuvable.');
      const expense = await tx.expense.create({ data: { ...input, createdBy: actor } });
      await this.audit(tx, actor, 'EXPENSE_CREATED', expense.id, expense.storeId);
      return expense;
    });
  }

  private async expense(tx: Prisma.TransactionClient, id: string) {
    const expense = await tx.expense.findUnique({ where: { id }, include: { cashMovement: true } });
    if (!expense) throw new NotFoundException('Dépense introuvable.');
    return expense;
  }

  approve(id: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const expense = await this.expense(tx, id);
      if (expense.status !== 'DRAFT') throw new ConflictException('Dépense non modifiable.');
      const result = await tx.expense.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: new Date(), approvedBy: actor },
      });
      await this.audit(tx, actor, 'EXPENSE_APPROVED', id, expense.storeId);
      return result;
    });
  }

  private async cash(
    tx: Prisma.TransactionClient,
    sessionId: string,
    storeId: string,
    amount: Prisma.Decimal,
    actor: string,
    reason: string,
    reversalOfId?: string,
  ) {
    const session = await tx.cashSession.findFirst({
      where: { id: sessionId, closedAt: null, register: { storeId } },
    });
    if (!session) throw new ConflictException('Session ouverte du magasin obligatoire.');
    const total = await tx.cashMovement.aggregate({
      where: { sessionId },
      _sum: { amount: true },
    });
    const next = session.opening.plus(total._sum.amount ?? 0).plus(amount);
    if (next.lt(0) || next.gt('9999999999999999.99'))
      throw new ConflictException('Solde de caisse insuffisant ou hors limite.');
    const movement = await tx.cashMovement.create({
      data: { sessionId, amount, actorId: actor, reason, operationKey: randomUUID(), reversalOfId },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor,
        storeId,
        action: reversalOfId ? 'CASH_EXPENSE_REFUNDED' : 'CASH_EXPENSE_PAID',
        entityType: 'Treasury',
        entityId: movement.id,
      },
    });
    return movement;
  }

  pay(id: string, input: ExpensePayment, actor: string) {
    return this.transaction(actor, async (tx) => {
      const expense = await this.expense(tx, id);
      if (expense.status !== 'APPROVED') throw new ConflictException('Dépense non approuvée.');
      if (input.method === 'CASH' ? !input.sessionId : !!input.sessionId || !input.reference)
        throw new ConflictException('Mode de paiement invalide.');
      const movement =
        input.method === 'CASH' && input.sessionId
          ? await this.cash(tx, input.sessionId, expense.storeId, expense.amount.negated(), actor, 'Dépense')
          : null;
      const result = await tx.expense.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidBy: actor,
          method: input.method,
          reference: input.reference,
          cashMovementId: movement?.id,
        },
      });
      await this.audit(tx, actor, 'EXPENSE_PAID', id, expense.storeId);
      return result;
    });
  }

  cancel(id: string, reason: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const expense = await this.expense(tx, id);
      if (!['DRAFT', 'APPROVED'].includes(expense.status))
        throw new ConflictException('Une dépense payée doit être remboursée.');
      const result = await tx.expense.update({
        where: { id },
        data: { status: 'CANCELLED', endedAt: new Date(), endedBy: actor, endReason: reason },
      });
      await this.audit(tx, actor, 'EXPENSE_CANCELLED', id, expense.storeId);
      return result;
    });
  }

  refund(id: string, reason: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const expense = await this.expense(tx, id);
      if (expense.status !== 'PAID') throw new ConflictException('Dépense non remboursable.');
      let refundMovementId: string | undefined;
      if (expense.method === 'CASH') {
        if (!expense.cashMovement) throw new ConflictException('Mouvement initial introuvable.');
        const original = await tx.cashSession.findUniqueOrThrow({
          where: { id: expense.cashMovement.sessionId },
        });
        const current = await tx.cashSession.findFirst({
          where: { registerId: original.registerId, closedAt: null },
        });
        if (!current) throw new ConflictException('Ouvrir la caisse d’origine pour le remboursement.');
        const refund = await this.cash(
          tx,
          current.id,
          expense.storeId,
          expense.amount,
          actor,
          'Remboursement de dépense',
          expense.cashMovement.id,
        );
        refundMovementId = refund.id;
      }
      const result = await tx.expense.update({
        where: { id },
        data: {
          status: 'REFUNDED',
          endedAt: new Date(),
          endedBy: actor,
          endReason: reason,
          refundMovementId,
        },
      });
      await this.audit(tx, actor, 'EXPENSE_REFUNDED', id, expense.storeId);
      return result;
    });
  }

  summary(actor: string, storeId?: string) {
    return this.transaction(actor, (tx) =>
      tx.expense.groupBy({
        by: ['status', 'categoryId'],
        where: { storeId },
        _sum: { amount: true },
        _count: true,
      }),
    );
  }
}
