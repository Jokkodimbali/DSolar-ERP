import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TreasuryPort } from '../application/treasury.port';

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
      return await this.prisma.$transaction(async (tx) => {
        await this.admin(tx, actor);
        return work(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))
        throw new ConflictException('Opération concurrente ou déjà enregistrée.');
      throw error;
    }
  }

  private async audit(tx: Prisma.TransactionClient, actor: string, storeId: string, action: string, id: string) {
    await tx.auditLog.create({ data: { actorId: actor, storeId, action, entityType: 'Treasury', entityId: id } });
  }

  list(actor: string) {
    return this.transaction(actor, (tx) => tx.cashRegister.findMany({
      where: { store: { status: 'ACTIVE' } },
      include: { sessions: { orderBy: { openedAt: 'desc' }, take: 20, include: { movements: { orderBy: { createdAt: 'desc' }, take: 100 } } } },
    }));
  }

  create(store: string, name: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      if (!await tx.store.findFirst({ where: { id: store, status: 'ACTIVE' } }))
        throw new NotFoundException('Magasin actif introuvable.');
      const result = await tx.cashRegister.create({ data: { storeId: store, name } });
      await this.audit(tx, actor, store, 'CASH_REGISTER_CREATED', result.id);
      return result;
    });
  }

  open(register: string, amount: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const cash = await tx.cashRegister.findFirst({ where: { id: register, store: { status: 'ACTIVE' } } });
      if (!cash) throw new NotFoundException('Caisse introuvable.');
      const result = await tx.cashSession.create({ data: { registerId: register, opening: amount, openedBy: actor } });
      await this.audit(tx, actor, cash.storeId, 'CASH_SESSION_OPENED', result.id);
      return result;
    });
  }

  private async session(tx: Prisma.TransactionClient, id: string) {
    const session = await tx.cashSession.findFirst({ where: { id, register: { store: { status: 'ACTIVE' } } }, include: { register: true } });
    if (!session) throw new NotFoundException('Session introuvable.');
    if (session.closedAt) throw new ConflictException('Session clôturée.');
    return session;
  }

  move(id: string, amount: string, reason: string, key: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const session = await this.session(tx, id);
      const total = await tx.cashMovement.aggregate({ where: { sessionId: id }, _sum: { amount: true } });
      if (session.opening.plus(total._sum.amount ?? 0).plus(amount).lt(0))
        throw new ConflictException('Solde de caisse insuffisant.');
      const result = await tx.cashMovement.create({ data: { sessionId: id, amount, reason, operationKey: key, actorId: actor } });
      await this.audit(tx, actor, session.register.storeId, 'CASH_MOVEMENT_CREATED', result.id);
      return result;
    });
  }

  close(id: string, counted: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const session = await this.session(tx, id);
      const total = await tx.cashMovement.aggregate({ where: { sessionId: id }, _sum: { amount: true } });
      const expected = session.opening.plus(total._sum.amount ?? 0);
      const result = await tx.cashSession.update({ where: { id }, data: { counted, expected, closedAt: new Date(), closedBy: actor } });
      await this.audit(tx, actor, session.register.storeId, 'CASH_SESSION_CLOSED', id);
      return { ...result, difference: new Prisma.Decimal(counted).minus(expected) };
    });
  }
}
