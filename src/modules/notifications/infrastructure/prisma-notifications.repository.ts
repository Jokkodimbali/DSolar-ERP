import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { NotificationsPort, NotificationFeed } from '../application/notifications.port';
import { ADMIN_EVENTS, STORE_EVENTS, notificationTitle } from '../domain/notification-events';

@Injectable()
export class PrismaNotificationsRepository implements NotificationsPort {
  constructor(private readonly prisma: PrismaService) {}

  private async scope(tx: Prisma.TransactionClient, actorId: string): Promise<Prisma.AuditLogWhereInput> {
    const user = await tx.user.findFirst({
      where: { id: actorId, status: 'ACTIVE' },
      select: {
        roles: { select: { role: { select: { code: true, permissions: { select: { permission: { select: { code: true } } } } } } } },
        stores: { where: { store: { status: 'ACTIVE' } }, select: { storeId: true } },
      },
    });
    if (!user) throw new ForbiddenException('Compte inactif.');
    if (user.roles.some((row) => row.role.code === 'ADMIN'))
      return { action: { in: Object.keys(ADMIN_EVENTS) } };
    const roles = user.roles.filter((row) => row.role.code === 'MAGASINIER');
    if (!roles.length) throw new ForbiddenException('Rôle interne requis.');
    const permissions = new Set(roles.flatMap((row) => row.role.permissions.map((p) => p.permission.code)));
    const actions = Object.keys(STORE_EVENTS).filter((action) =>
      action === 'GOODS_RECEIPT_CONFIRMED' ? permissions.has('inventory.read') : permissions.has('sales.read'),
    );
    return { action: { in: actions }, storeId: { in: user.stores.map((row) => row.storeId) } };
  }

  feed(actorId: string): Promise<NotificationFeed> {
    return this.prisma.$transaction(async (tx) => {
      const where = await this.scope(tx, actorId);
      const settings = await tx.companySettings.findFirst({ orderBy: { revision: 'desc' }, select: { notificationsEnabled: true } });
      if (settings?.notificationsEnabled === false) return { enabled: false, unread: 0, items: [] };
      const [rows, unread] = await Promise.all([
        tx.auditLog.findMany({
          where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
          select: {
            id: true, action: true, entityType: true, entityId: true, storeId: true, createdAt: true,
            notificationReads: { where: { userId: actorId }, select: { auditId: true } },
          },
        }),
        tx.auditLog.count({ where: { AND: [where, { notificationReads: { none: { userId: actorId } } }] } }),
      ]);
      return {
        enabled: true, unread,
        items: rows.map((row) => ({
          id: row.id, action: row.action, title: notificationTitle(row.action), entityType: row.entityType,
          entityId: row.entityId, storeId: row.storeId, createdAt: row.createdAt, read: row.notificationReads.length > 0,
        })),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  mark(actorId: string, id?: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const scope = await this.scope(tx, actorId);
      if (id && !await tx.auditLog.findFirst({ where: { AND: [scope, { id }] }, select: { id: true } }))
        throw new NotFoundException('Notification introuvable.');
      const rows = await tx.auditLog.findMany({
        where: { AND: [scope, ...(id ? [{ id }] : []), { notificationReads: { none: { userId: actorId } } }] },
        select: { id: true }, take: 1000, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const result = await tx.notificationRead.createMany({
        data: rows.map((row) => ({ userId: actorId, auditId: row.id })), skipDuplicates: true,
      });
      return result.count;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
