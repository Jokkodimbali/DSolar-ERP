import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TreasuryPort } from '../application/treasury.port';
import { validCashAmount } from '../domain/cash-amount';

@Injectable()
export class TreasuryRepository implements TreasuryPort {
  constructor(private readonly prisma: PrismaService) {}

  private async admin(tx: Prisma.TransactionClient, actor: string) {
    const user = await tx.user.findFirst({
      where: { id: actor, status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
    });
    if (!user) throw new ForbiddenException('Accès trésorerie interdit.');
  }

  private async transaction<T>(actor: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.admin(tx, actor);
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
    actor: string,
    storeId: string,
    action: string,
    id: string,
  ) {
    await tx.auditLog.create({
      data: { actorId: actor, storeId, action, entityType: 'Treasury', entityId: id },
    });
  }

  list(actor: string) {
    return this.transaction(actor, (tx) =>
      tx.cashRegister.findMany({
        include: {
          sessions: {
            orderBy: { openedAt: 'desc' },
            take: 20,
            include: { movements: { orderBy: { createdAt: 'desc' }, take: 100 } },
          },
        },
      }),
    );
  }

  create(store: string, name: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      if (!(await tx.store.findFirst({ where: { id: store, status: 'ACTIVE' } })))
        throw new NotFoundException('Magasin actif introuvable.');
      const result = await tx.cashRegister.create({ data: { storeId: store, name } });
      await this.audit(tx, actor, store, 'CASH_REGISTER_CREATED', result.id);
      return result;
    });
  }

  open(register: string, amount: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      if (!validCashAmount(amount)) throw new ConflictException('Montant d’ouverture invalide.');
      const cash = await tx.cashRegister.findFirst({
        where: { id: register, store: { status: 'ACTIVE' } },
      });
      if (!cash) throw new NotFoundException('Caisse introuvable.');
      const result = await tx.cashSession.create({
        data: { registerId: register, opening: amount, openedBy: actor },
      });
      await this.audit(tx, actor, cash.storeId, 'CASH_SESSION_OPENED', result.id);
      return result;
    });
  }

  private async session(tx: Prisma.TransactionClient, id: string, requireOpen = true) {
    const session = await tx.cashSession.findUnique({
      where: { id },
      include: { register: { include: { store: true } } },
    });
    if (!session) throw new NotFoundException('Session introuvable.');
    if (requireOpen && session.closedAt) throw new ConflictException('Session clôturée.');
    return session;
  }

  private async balance(tx: Prisma.TransactionClient, id: string, opening: Prisma.Decimal) {
    const total = await tx.cashMovement.aggregate({
      where: { sessionId: id },
      _sum: { amount: true },
    });
    return opening.plus(total._sum.amount ?? 0);
  }

  private checkBalance(balance: Prisma.Decimal, amount: Prisma.Decimal) {
    const next = balance.plus(amount);
    if (next.lt(0)) throw new ConflictException('Solde de caisse insuffisant.');
    if (next.gt('9999999999999999.99')) throw new ConflictException('Solde maximal dépassé.');
  }

  move(id: string, amount: string, reason: string, key: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      if (!validCashAmount(amount, true, false)) throw new ConflictException('Montant du mouvement invalide.');
      const value = new Prisma.Decimal(amount);
      const existing = await tx.cashMovement.findUnique({
        where: { operationKey: key },
        include: { expensePayment: true, expenseRefund: true },
      });
      if (existing) {
        if (
          existing.sessionId !== id ||
          !existing.amount.eq(value) ||
          existing.reason !== reason ||
          existing.actorId !== actor ||
          existing.transferKey ||
          existing.reversalOfId ||
          existing.paymentId ||
          existing.expensePayment ||
          existing.expenseRefund
        )
          throw new ConflictException('Clé opération déjà utilisée.');
        const { expensePayment: _payment, expenseRefund: _refund, ...movement } = existing;
        return movement;
      }
      const session = await this.session(tx, id);
      this.checkBalance(await this.balance(tx, id, session.opening), value);
      const result = await tx.cashMovement.create({
        data: { sessionId: id, amount: value, reason, operationKey: key, actorId: actor },
      });
      await this.audit(tx, actor, session.register.storeId, 'CASH_MOVEMENT_CREATED', result.id);
      return result;
    });
  }

  transfer(from: string, to: string, amount: string, key: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      if (from === to || !validCashAmount(amount, false, false))
        throw new ConflictException('Transfert invalide.');
      const value = new Prisma.Decimal(amount);
      const previous = await tx.cashMovement.findUnique({ where: { operationKey: key } });
      if (previous) {
        const credit = await tx.cashMovement.findFirst({
          where: { transferKey: key, amount: { gt: 0 } },
        });
        if (
          previous.transferKey !== key ||
          previous.sessionId !== from ||
          !previous.amount.eq(value.negated()) ||
          previous.actorId !== actor ||
          !credit ||
          credit.sessionId !== to ||
          !credit.amount.eq(value) ||
          credit.actorId !== actor
        )
          throw new ConflictException('Clé opération déjà utilisée.');
        return { debit: previous, credit };
      }
      const source = await this.session(tx, from);
      const target = await this.session(tx, to);
      this.checkBalance(await this.balance(tx, from, source.opening), value.negated());
      this.checkBalance(await this.balance(tx, to, target.opening), value);
      const debit = await tx.cashMovement.create({
        data: {
          sessionId: from,
          amount: value.negated(),
          reason: 'Transfert sortant',
          operationKey: key,
          transferKey: key,
          actorId: actor,
        },
      });
      const credit = await tx.cashMovement.create({
        data: {
          sessionId: to,
          amount: value,
          reason: 'Transfert entrant',
          operationKey: randomUUID(),
          transferKey: key,
          actorId: actor,
        },
      });
      await this.audit(tx, actor, source.register.storeId, 'CASH_TRANSFER_DEBIT', debit.id);
      await this.audit(tx, actor, target.register.storeId, 'CASH_TRANSFER_CREDIT', credit.id);
      return { debit, credit };
    });
  }

  reverse(id: string, reason: string, key: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const previous = await tx.cashMovement.findUnique({ where: { operationKey: key } });
      if (previous) {
        if (previous.reversalOfId !== id || previous.reason !== reason || previous.actorId !== actor) {
          throw new ConflictException('Clé opération déjà utilisée.');
        }
        return previous;
      }
      const original = await tx.cashMovement.findUnique({
        where: { id },
        include: { expensePayment: true, expenseRefund: true },
      });
      if (!original) throw new NotFoundException('Mouvement introuvable.');
      if (
        original.transferKey || original.reversalOfId || original.paymentId || original.expensePayment || original.expenseRefund
      )
        throw new ConflictException('Mouvement non contrepassable individuellement.');
      const session = await this.session(tx, original.sessionId);
      const amount = original.amount.negated();
      this.checkBalance(await this.balance(tx, session.id, session.opening), amount);
      const result = await tx.cashMovement.create({
        data: {
          sessionId: session.id,
          amount,
          reason,
          operationKey: key,
          reversalOfId: id,
          actorId: actor,
        },
      });
      await this.audit(tx, actor, session.register.storeId, 'CASH_MOVEMENT_REVERSED', result.id);
      return result;
    });
  }

  reconcile(id: string, paymentId: string, key: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const previous = await tx.cashMovement.findUnique({ where: { operationKey: key } });
      if (previous) {
        if (previous.sessionId !== id || previous.paymentId !== paymentId || previous.actorId !== actor) {
          throw new ConflictException('Clé opération déjà utilisée.');
        }
        return previous;
      }
      const session = await this.session(tx, id);
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { reversals: true, order: { include: { lines: true } } },
      });
      if (!payment) throw new NotFoundException('Paiement introuvable.');
      if (
        payment.method !== 'CASH' ||
        payment.reversals.length > 0 ||
        payment.amount.lte(0) ||
        !payment.order.lines.length ||
        payment.order.lines.some((line) => line.storeId !== session.register.storeId)
      )
        throw new ConflictException('Paiement non rapprochable de cette caisse.');
      this.checkBalance(await this.balance(tx, id, session.opening), payment.amount);
      const result = await tx.cashMovement.create({
        data: {
          sessionId: id,
          amount: payment.amount,
          reason: 'Encaissement commercial',
          operationKey: key,
          paymentId,
          actorId: actor,
        },
      });
      await this.audit(tx, actor, session.register.storeId, 'CASH_PAYMENT_RECONCILED', result.id);
      return result;
    });
  }

  summary(id: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const session = await this.session(tx, id, false);
      const [incoming, outgoing] = await Promise.all([
        tx.cashMovement.aggregate({
          where: { sessionId: id, amount: { gt: 0 } },
          _sum: { amount: true },
          _count: true,
        }),
        tx.cashMovement.aggregate({
          where: { sessionId: id, amount: { lt: 0 } },
          _sum: { amount: true },
          _count: true,
        }),
      ]);
      const entries = incoming._sum.amount ?? new Prisma.Decimal(0);
      const exits = (outgoing._sum.amount ?? new Prisma.Decimal(0)).abs();
      const expected = session.opening.plus(entries).minus(exits);
      return {
        sessionId: id,
        opening: session.opening,
        entries,
        exits,
        expected,
        counted: session.counted,
        difference: session.counted?.minus(expected) ?? null,
        movementCount: incoming._count + outgoing._count,
        closedAt: session.closedAt,
      };
    });
  }

  close(id: string, counted: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      if (!validCashAmount(counted)) throw new ConflictException('Montant compté invalide.');
      const session = await this.session(tx, id);
      const expected = await this.balance(tx, id, session.opening);
      const result = await tx.cashSession.update({
        where: { id },
        data: { counted, expected, closedAt: new Date(), closedBy: actor },
      });
      await this.audit(tx, actor, session.register.storeId, 'CASH_SESSION_CLOSED', id);
      return { ...result, difference: new Prisma.Decimal(counted).minus(expected) };
    });
  }
}
