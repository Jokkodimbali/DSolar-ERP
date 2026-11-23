import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface AuditQuery {
  limit: number;
  cursor?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  storeId?: string;
}

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(actorId: string, query: AuditQuery) {
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: {
        status: true,
        roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE' || user.roles.length === 0)
      throw new ForbiddenException('Journal réservé aux administrateurs.');

    const where: Prisma.AuditLogWhereInput = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
    };
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
}
