import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface AuditQuery {
  limit: number;
  actorId?: string;
  cursor?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  storeId?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async authorize(actorId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: {
        status: true,
        roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE' || user.roles.length === 0)
      throw new ForbiddenException('Journal réservé aux administrateurs.');

  }

  private where(query: AuditQuery): Prisma.AuditLogWhereInput {
    return {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: new Date(query.to.getTime() + 86400000) } : {}) } }
        : {}),
    };
  }

  async list(actorId: string, query: AuditQuery) {
    await this.authorize(actorId);
    const where = this.where(query);
    if (query.cursor) {
      const anchor = await this.prisma.auditLog.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true },
      });
      if (!anchor) throw new NotFoundException('Curseur de pagination invalide pour ces filtres.');
    }
    const records = await this.prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        storeId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = records.length > query.limit;
    const items = records.slice(0, query.limit);
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async summary(actorId: string, query: AuditQuery) {
    await this.authorize(actorId);
    const where = this.where(query);
    const [total, byAction, byEntityType] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({ by: ['action'], where, _count: { _all: true }, orderBy: { action: 'asc' } }),
      this.prisma.auditLog.groupBy({ by: ['entityType'], where, _count: { _all: true }, orderBy: { entityType: 'asc' } }),
    ]);
    return {
      total,
      byAction: byAction.map((item) => ({ action: item.action, count: item._count._all })),
      byEntityType: byEntityType.map((item) => ({ entityType: item.entityType, count: item._count._all })),
    };
  }
}
