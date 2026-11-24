import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { StoreAccessRepository } from '../application/store-access.repository';

@Injectable()
export class PrismaStoreAccessRepository implements StoreAccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  async userExists(userId: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id: userId, status: 'ACTIVE' } })) > 0;
  }

  async hasAccess(userId: string, storeId: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: {
      id: userId, status: 'ACTIVE',
      OR: [{ roles: { some: { role: { code: 'ADMIN' } } } }, { stores: { some: { storeId } } }],
    } })) > 0;
  }

  private async change(userId: string, storeId: string, actorId: string, grant: boolean): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        if (!(await tx.user.findFirst({ where: { id: actorId, status: 'ACTIVE',
          roles: { some: { role: { code: 'ADMIN' } } } }, select: { id: true } })))
          throw new ForbiddenException('Modification des accès réservée aux administrateurs.');
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
        if (!user) throw new NotFoundException('Utilisateur introuvable.');
        const store = await tx.store.findUnique({ where: { id: storeId }, select: { status: true } });
        if (!store) throw new NotFoundException('Magasin introuvable.');
        if (grant && (user.status !== 'ACTIVE' || store.status !== 'ACTIVE'))
          throw new ConflictException('Utilisateur et magasin actifs requis.');
        const existing = await tx.userStoreAccess.findUnique({ where: { userId_storeId: { userId, storeId } } });
        if (!!existing === grant) return;
        if (grant) await tx.userStoreAccess.create({ data: { userId, storeId } });
        else await tx.userStoreAccess.delete({ where: { userId_storeId: { userId, storeId } } });
        await tx.user.update({ where: { id: userId }, data: {
          tokenVersion: { increment: 1 },
          sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } },
        } });
        await tx.auditLog.create({ data: { actorId, storeId, entityType: 'UserStoreAccess', entityId: userId,
          action: grant ? 'STORE_ACCESS_GRANTED' : 'STORE_ACCESS_REVOKED', payload: { userId, storeId } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002','P2034'].includes(error.code))
        throw new ConflictException('Modification concurrente des accès. Réessayez.');
      throw error;
    }
  }

  grant(userId: string, storeId: string, actorId: string) {
    return this.change(userId, storeId, actorId, true);
  }

  revoke(userId: string, storeId: string, actorId: string) {
    return this.change(userId, storeId, actorId, false);
  }

  async listStoreIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userStoreAccess.findMany({
      where: { userId, user: { status: 'ACTIVE' } }, select: { storeId: true },
    });
    return rows.map((row) => row.storeId);
  }

  async listVisible(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: {
        status: true, roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } },
      } });
      if (!user || user.status !== 'ACTIVE') throw new ForbiddenException('Utilisateur inactif.');
      return tx.store.findMany({
        where: user.roles.length ? {} : { status: 'ACTIVE', userAccess: { some: { userId } } },
        orderBy: { name: 'asc' },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
