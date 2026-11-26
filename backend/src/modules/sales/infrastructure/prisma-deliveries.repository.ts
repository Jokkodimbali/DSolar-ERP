import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { DeliveryInput, DeliveriesRepository } from '../application/deliveries.port';

@Injectable()
export class PrismaDeliveriesRepository implements DeliveriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(orderId: string, actorId: string) {
    return this.prisma.deliveryNote.findMany({
      where: {
        orderId,
        order: {
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
      },
      include: { lines: true },
      orderBy: { number: 'desc' },
    });
  }

  find(orderId: string, deliveryId: string, actorId: string) {
    return this.prisma.deliveryNote.findFirst({
      where: {
        id: deliveryId,
        orderId,
        order: {
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
      },
      include: { lines: true },
    });
  }

  progress(orderId: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.salesOrder.findFirst({
          where: {
            id: orderId,
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
            lines: {
              include: { product: { select: { name: true, sku: true } }, store: { select: { name: true } } },
            },
          },
        });
        if (!order) throw new NotFoundException('Commande introuvable ou non autorisée.');
        const confirmed = await tx.deliveryLine.groupBy({
          by: ['storeId', 'productId'],
          where: { delivery: { orderId, status: 'CONFIRMED' } },
          _sum: { quantity: true },
        });
        const delivered = new Map(
          confirmed.map((line) => [
            line.storeId + ':' + line.productId,
            line._sum.quantity ?? new Prisma.Decimal(0),
          ]),
        );
        const ordered = new Map<
          string,
          {
            storeId: string;
            productId: string;
            store: string;
            product: string;
            sku: string;
            quantity: Prisma.Decimal;
          }
        >();
        for (const line of order.lines) {
          const key = line.storeId + ':' + line.productId;
          if (!line.quantity.isFinite() || !line.quantity.greaterThan(0))
            throw new ConflictException('Quantité de commande invalide.');
          const previous = ordered.get(key);
          if (previous) previous.quantity = previous.quantity.plus(line.quantity);
          else
            ordered.set(key, {
              storeId: line.storeId,
              productId: line.productId,
              store: line.store.name,
              product: line.product.name,
              sku: line.product.sku,
              quantity: line.quantity,
            });
        }
        if ([...delivered.keys()].some((key) => !ordered.has(key)))
          throw new ConflictException('Historique de livraison incohérent.');
        const lines = [...ordered].map(([key, line]) => {
          const done = delivered.get(key) ?? new Prisma.Decimal(0);
          const remaining = line.quantity.minus(done);
          if (done.isNegative() || remaining.isNegative())
            throw new ConflictException('Historique de livraison incohérent.');
          return {
            ...line,
            quantity: line.quantity.toFixed(3),
            delivered: done.toFixed(3),
            remaining: remaining.toFixed(3),
          };
        });
        return { orderId, status: order.status, lines };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async create(orderId: string, actorId: string, input: DeliveryInput) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.salesOrder.findUnique({
          where: { id: orderId },
          include: { lines: true, deliveries: { where: { status: 'CONFIRMED' }, include: { lines: true } } },
        });
        if (!order) throw new NotFoundException('Commande introuvable.');
        const stores = [...new Set(order.lines.map((line) => line.storeId))];
        const allowed = await tx.userStoreAccess.count({
          where: {
            userId: actorId,
            user: { status: 'ACTIVE' },
            storeId: { in: stores },
            store: { status: 'ACTIVE' },
          },
        });
        if (!stores.length || allowed !== stores.length)
          throw new ForbiddenException('Accès magasin refusé.');
        const number = input.operationKey ? 'BL-' + input.operationKey.toUpperCase() : undefined;
        if (number) {
          const existing = await tx.deliveryNote.findUnique({ where: { number }, include: { lines: true } });
          if (existing) {
            if (
              existing.orderId !== orderId ||
              existing.lines.length !== input.lines.length ||
              !input.lines.every((line) =>
                existing.lines.some(
                  (saved) =>
                    saved.storeId === line.storeId &&
                    saved.productId === line.productId &&
                    saved.quantity.eq(line.quantity),
                ),
              ) ||
              new Set(input.lines.map((line) => line.storeId + ':' + line.productId)).size !==
                input.lines.length
            )
              throw new ConflictException('Clé de livraison déjà utilisée avec des données différentes.');
            return existing;
          }
        }
        if (order.status !== 'CONFIRMED' && order.status !== 'PARTIALLY_DELIVERED') {
          throw new ConflictException('La commande doit être confirmée.');
        }
        const ordered = new Map<string, Prisma.Decimal>();
        for (const line of order.lines) {
          const key = `${line.storeId}:${line.productId}`;
          ordered.set(key, (ordered.get(key) ?? new Prisma.Decimal(0)).plus(line.quantity));
        }
        const delivered = new Map<string, Prisma.Decimal>();
        for (const note of order.deliveries) {
          for (const line of note.lines) {
            const key = `${line.storeId}:${line.productId}`;
            delivered.set(key, (delivered.get(key) ?? new Prisma.Decimal(0)).plus(line.quantity));
          }
        }
        if (!input.lines.length || input.lines.length > 100)
          throw new ConflictException('Un bon de livraison doit contenir de 1 à 100 lignes.');
        if (
          number &&
          new Set(input.lines.map((line) => line.storeId + ':' + line.productId)).size !== input.lines.length
        )
          throw new ConflictException('Produit et magasin en double dans le bon de livraison.');
        const requested = new Map<string, Prisma.Decimal>();
        for (const line of input.lines) {
          const key = `${line.storeId}:${line.productId}`;
          const quantity = new Prisma.Decimal(line.quantity);
          if (!quantity.isFinite() || !quantity.greaterThan(0) || quantity.decimalPlaces() > 3) {
            throw new ConflictException('Quantité invalide.');
          }
          requested.set(key, (requested.get(key) ?? new Prisma.Decimal(0)).plus(quantity));
        }
        for (const [key, quantity] of requested) {
          if (!ordered.has(key)) throw new ConflictException('Produit ou magasin absent de la commande.');
          const remaining = (ordered.get(key) ?? new Prisma.Decimal(0)).minus(
            delivered.get(key) ?? new Prisma.Decimal(0),
          );
          if (quantity.greaterThan(remaining)) {
            throw new ConflictException('Quantité supérieure au reliquat de commande.');
          }
        }
        const note = await tx.deliveryNote.create({
          data: {
            number: number ?? `BL-${randomUUID().slice(0, 12).toUpperCase()}`,
            orderId,
            lines: {
              create: input.lines.map((line) => ({
                storeId: line.storeId,
                productId: line.productId,
                quantity: new Prisma.Decimal(line.quantity),
              })),
            },
          },
          include: { lines: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'DELIVERY_CREATED',
            entityType: 'DeliveryNote',
            entityId: note.id,
            ...(stores.length === 1 ? { storeId: stores[0] } : {}),
            payload: { orderId, storeIds: stores },
          },
        });
        return note;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async confirm(orderId: string, deliveryId: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.salesOrder.findUnique({
          where: { id: orderId },
          include: { lines: true, deliveries: { include: { lines: true } } },
        });
        if (!order) throw new NotFoundException('Commande introuvable.');
        const stores = [...new Set(order.lines.map((line) => line.storeId))];
        const allowed = await tx.userStoreAccess.count({
          where: {
            userId: actorId,
            user: { status: 'ACTIVE' },
            storeId: { in: stores },
            store: { status: 'ACTIVE' },
          },
        });
        if (!stores.length || allowed !== stores.length)
          throw new ForbiddenException('Accès magasin refusé.');
        if (order.status !== 'CONFIRMED' && order.status !== 'PARTIALLY_DELIVERED') {
          throw new ConflictException('Commande non livrable.');
        }
        const note = order.deliveries.find((item) => item.id === deliveryId);
        if (!note) throw new NotFoundException('Bon de livraison introuvable.');
        if (note.status !== 'DRAFT') throw new ConflictException('Bon déjà traité.');
        if (!note.lines.length) throw new ConflictException('Bon de livraison sans lignes.');
        const ordered = new Map<string, Prisma.Decimal>();
        for (const line of order.lines) {
          const key = `${line.storeId}:${line.productId}`;
          ordered.set(key, (ordered.get(key) ?? new Prisma.Decimal(0)).plus(line.quantity));
        }
        const delivered = new Map<string, Prisma.Decimal>();
        for (const item of order.deliveries.filter((entry) => entry.status === 'CONFIRMED')) {
          for (const line of item.lines) {
            const key = `${line.storeId}:${line.productId}`;
            delivered.set(key, (delivered.get(key) ?? new Prisma.Decimal(0)).plus(line.quantity));
          }
        }
        const current = new Map<string, Prisma.Decimal>();
        for (const line of note.lines) {
          if (!line.quantity.isFinite() || !line.quantity.greaterThan(0))
            throw new ConflictException('Quantité de livraison invalide.');
          const key = `${line.storeId}:${line.productId}`;
          current.set(key, (current.get(key) ?? new Prisma.Decimal(0)).plus(line.quantity));
        }
        for (const [key, quantity] of current) {
          const total = ordered.get(key);
          if (
            !total ||
            !quantity.greaterThan(0) ||
            quantity.greaterThan(total.minus(delivered.get(key) ?? new Prisma.Decimal(0)))
          )
            throw new ConflictException('Quantité de livraison supérieure au reliquat.');
        }
        for (const [key, quantity] of [...current].sort(([a], [b]) => a.localeCompare(b))) {
          const [storeId, productId] = key.split(':');
          const changed = await tx.storeStock.updateMany({
            where: { storeId, productId, quantity: { gte: quantity }, reserved: { gte: quantity } },
            data: { quantity: { decrement: quantity }, reserved: { decrement: quantity } },
          });
          if (changed.count !== 1) throw new ConflictException('Stock réservé insuffisant.');
          await tx.stockMovement.create({
            data: {
              storeId,
              productId,
              type: 'DELIVERY',
              quantity,
              referenceType: 'DeliveryNote',
              referenceId: deliveryId,
              operationKey: `delivery:${deliveryId}:${storeId}:${productId}`,
              actorId,
            },
          });
          delivered.set(key, (delivered.get(key) ?? new Prisma.Decimal(0)).plus(quantity));
        }
        const complete = [...ordered].every(([key, quantity]) =>
          (delivered.get(key) ?? new Prisma.Decimal(0)).equals(quantity),
        );
        const updated = await tx.deliveryNote.update({
          where: { id: deliveryId },
          data: { status: 'CONFIRMED', deliveredAt: new Date() },
          include: { lines: true },
        });
        await tx.salesOrder.update({
          where: { id: orderId },
          data: { status: complete ? 'DELIVERED' : 'PARTIALLY_DELIVERED' },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'DELIVERY_CONFIRMED',
            entityType: 'DeliveryNote',
            entityId: deliveryId,
            ...(stores.length === 1 ? { storeId: stores[0] } : {}),
            payload: {
              orderId,
              storeIds: stores,
              orderStatus: complete ? 'DELIVERED' : 'PARTIALLY_DELIVERED',
            },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async cancel(orderId: string, deliveryId: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
        const note = await tx.deliveryNote.findFirst({
          where: { id: deliveryId, orderId },
          include: { order: { include: { lines: true } } },
        });
        if (!note) throw new NotFoundException('Bon de livraison introuvable.');
        const stores = [...new Set(note.order.lines.map((line) => line.storeId))];
        const allowed = await tx.userStoreAccess.count({
          where: {
            userId: actorId,
            user: { status: 'ACTIVE' },
            storeId: { in: stores },
            store: { status: 'ACTIVE' },
          },
        });
        if (!stores.length || allowed !== stores.length)
          throw new ForbiddenException('Accès magasin refusé.');
        if (note.status !== 'DRAFT') throw new ConflictException('Seul un brouillon peut être annulé.');
        const updated = await tx.deliveryNote.update({
          where: { id: deliveryId },
          data: { status: 'CANCELLED' },
          include: { lines: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'DELIVERY_CANCELLED',
            entityType: 'DeliveryNote',
            entityId: deliveryId,
            ...(stores.length === 1 ? { storeId: stores[0] } : {}),
            payload: { orderId, storeIds: stores },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
