import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { OrdersRepository } from '../application/orders.port';
import { assertStoredSalesPricing } from './sales-pricing';

@Injectable()
export class PrismaOrdersRepository implements OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // prettier-ignore
  list(actorId: string) {
    return this.prisma.salesOrder.findMany({
      where: {
        lines: {
          some: {},
          every: {
            store: {
              status: 'ACTIVE',
              userAccess: { some: { userId: actorId, user: { status: 'ACTIVE' } } },
            },
          },
        },
      },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // prettier-ignore
  find(id: string, actorId: string) {
    return this.prisma.salesOrder.findFirst({
      where: {
        id,
        lines: {
          some: {},
          every: {
            store: {
              status: 'ACTIVE',
              userAccess: { some: { userId: actorId, user: { status: 'ACTIVE' } } },
            },
          },
        },
      },
      include: {
        customer: { select: { name: true } },
        lines: { include: { product: { select: { name: true, sku: true } }, store: { select: { name: true } } } },
      },
    });
  }

  // prettier-ignore
  async confirm(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${id}::uuid FOR UPDATE`;
        const order = await tx.salesOrder.findUnique({
          where: { id },
          include: { lines: true },
        });
        if (!order) throw new NotFoundException('Commande introuvable.');
        const storeIds = [...new Set(order.lines.map((line) => line.storeId))];
        const authorized = await tx.userStoreAccess.count({
          where: {
            userId: actorId,
            user: { status: 'ACTIVE' },
            storeId: { in: storeIds },
            store: { status: 'ACTIVE' },
          },
        });
        if (!storeIds.length || authorized !== storeIds.length)
          throw new ForbiddenException('Accès insuffisant aux magasins de la commande.');

        if (order.status !== 'DRAFT')
          throw new ConflictException('Seule une commande brouillon peut être confirmée.');
        const totals = new Map<string, { storeId: string; productId: string; quantity: Prisma.Decimal }>();
        for (const line of order.lines) {
          if (!line.quantity.isFinite() || !line.quantity.greaterThan(0))
            throw new ConflictException('Quantité de commande invalide.');
          const key = `${line.storeId}:${line.productId}`;
          const current = totals.get(key);
          if (current) current.quantity = current.quantity.plus(line.quantity);
          else {
            totals.set(key, {
              storeId: line.storeId,
              productId: line.productId,
              quantity: line.quantity,
            });
          }
        }
        const sortedTotals = [...totals.values()].sort((a, b) => {
          const left = `${a.storeId}:${a.productId}`;
          const right = `${b.storeId}:${b.productId}`;
          return left.localeCompare(right);
        });
        for (const item of sortedTotals) {
          if (!item.quantity.greaterThan(0)) throw new ConflictException('Quantité de commande invalide.');
          const changed = await tx.$executeRaw`
            UPDATE "StoreStock"
            SET "reserved" = "reserved" + ${item.quantity}
            WHERE "storeId" = ${item.storeId}::uuid
              AND "productId" = ${item.productId}::uuid
              AND "quantity" - "reserved" >= ${item.quantity}
          `;
          if (changed !== 1)
            throw new ConflictException('Stock disponible insuffisant pour confirmer la commande.');
        }
        const updated = await tx.salesOrder.update({
          where: { id },
          data: { status: 'CONFIRMED' },
          include: { lines: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'SALES_ORDER_CONFIRMED',
            entityType: 'SalesOrder',
            entityId: id,
            ...(storeIds.length === 1 ? { storeId: storeIds[0] } : {}),
            payload: { storeIds, reservedLines: totals.size },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // prettier-ignore
  async cancel(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${id}::uuid FOR UPDATE`;
        const order = await tx.salesOrder.findUnique({
          where: { id },
          include: { lines: true, deliveries: true, payments: true, invoices: true },
        });
        if (!order) throw new NotFoundException('Commande introuvable.');
        const storeIds = [...new Set(order.lines.map((line) => line.storeId))];
        const authorized = await tx.userStoreAccess.count({
          where: {
            userId: actorId,
            user: { status: 'ACTIVE' },
            storeId: { in: storeIds },
            store: { status: 'ACTIVE' },
          },
        });
        if (!storeIds.length || authorized !== storeIds.length) {
          throw new ForbiddenException('Accès insuffisant aux magasins de la commande.');
        }
        if (order.status !== 'DRAFT' && order.status !== 'CONFIRMED') {
          throw new ConflictException('Cette commande ne peut plus être annulée.');
        }
        if (order.invoices?.some((invoice) => invoice.status !== 'CANCELLED')) {
          throw new ConflictException('Annulez la facture brouillon avant la commande. Une facture émise interdit cette annulation.');
        }
        if (order.deliveries.length || order.payments.length) {
          throw new ConflictException('Annulation interdite après livraison ou paiement.');
        }
        if (order.status === 'CONFIRMED') {
          const releases = new Map<string, Prisma.Decimal>();
          for (const line of order.lines) {
            if (!line.quantity.isFinite() || !line.quantity.greaterThan(0))
              throw new ConflictException('Quantité de commande invalide.');
            const key = `${line.storeId}:${line.productId}`;
            releases.set(key, (releases.get(key) ?? new Prisma.Decimal(0)).plus(line.quantity));
          }
          for (const [key, quantity] of [...releases].sort(([a], [b]) => a.localeCompare(b))) {
            const [storeId, productId] = key.split(':');
            const changed = await tx.storeStock.updateMany({
              where: {
                storeId,
                productId,
                reserved: { gte: quantity },
              },
              data: { reserved: { decrement: quantity } },
            });
            if (changed.count !== 1) {
              throw new ConflictException('Réservation de stock incohérente.');
            }
          }
        }
        const updated = await tx.salesOrder.update({
          where: { id },
          data: { status: 'CANCELLED' },
          include: { lines: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'SALES_ORDER_CANCELLED',
            entityType: 'SalesOrder',
            entityId: id,
            ...(storeIds.length === 1 ? { storeId: storeIds[0] } : {}),
            payload: { storeIds, previousStatus: order.status },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // prettier-ignore
  async convert(proformaId: string, actorId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Proforma" WHERE id = ${proformaId}::uuid FOR UPDATE`;
          const proforma = await tx.proforma.findUnique({
            where: { id: proformaId },
            include: { lines: true },
          });
          if (!proforma) throw new NotFoundException('Devis proforma introuvable.');
          const storeIds = [...new Set(proforma.lines.map((line) => line.storeId))];
          const authorized = await tx.userStoreAccess.count({
            where: {
            userId: actorId,
            user: { status: 'ACTIVE' },
            storeId: { in: storeIds },
            store: { status: 'ACTIVE' },
          },
          });
          if (!storeIds.length || authorized !== storeIds.length)
            throw new ForbiddenException('Accès insuffisant aux magasins du devis.');
          if (proforma.status !== DocumentStatus.ACCEPTED)
            throw new ConflictException('Seul un devis accepté peut être converti.');
          const existing = await tx.salesOrder.findFirst({ where: { proformaId } });
          if (existing) throw new ConflictException('Ce devis a déjà été converti.');
          assertStoredSalesPricing(proforma.lines, proforma.total);
          const order = await tx.salesOrder.create({
            data: {
              number: `CMD-${randomUUID().slice(0, 12).toUpperCase()}`,
              customerId: proforma.customerId,
              proformaId,
              total: proforma.total,
              lines: {
                create: proforma.lines.map((line) => ({
                  productId: line.productId,
                  storeId: line.storeId,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  discount: line.discount,
                  taxRate: line.taxRate,
                  lineTotal: line.lineTotal,
                })),
              },
            },
            include: { lines: true },
          });
          await tx.auditLog.create({
            data: {
              actorId,
              action: 'SALES_ORDER_CREATED',
              entityType: 'SalesOrder',
              entityId: order.id,
              ...(storeIds.length === 1 ? { storeId: storeIds[0] } : {}),
              payload: { storeIds, proformaId, number: order.number },
            },
          });
          return order;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Devis déjà converti ou numéro de commande déjà utilisé.');
      throw error;
    }
  }
}
