import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateDeliveryDto } from '../presentation/create-delivery.dto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { DeliveriesRepository } from '../application/deliveries.port';

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
            every: { store: { userAccess: { some: { userId: actorId } } } },
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
            every: { store: { userAccess: { some: { userId: actorId } } } },
          },
        },
      },
      include: { lines: true },
    });
  }

  async create(orderId: string, actorId: string, input: CreateDeliveryDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.salesOrder.findUnique({
        where: { id: orderId },
        include: { lines: true, deliveries: { where: { status: 'CONFIRMED' }, include: { lines: true } } },
      });
      if (!order) throw new NotFoundException('Commande introuvable.');
      if (order.status !== 'CONFIRMED' && order.status !== 'PARTIALLY_DELIVERED') {
        throw new ConflictException('La commande doit être confirmée.');
      }
      const stores = [...new Set(order.lines.map((line) => line.storeId))];
      const allowed = await tx.userStoreAccess.count({
        where: { userId: actorId, storeId: { in: stores } },
      });
      if (allowed !== stores.length) throw new ForbiddenException('Accès magasin refusé.');
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
      const requested = new Map<string, Prisma.Decimal>();
      for (const line of input.lines) {
        const key = `${line.storeId}:${line.productId}`;
        const quantity = new Prisma.Decimal(line.quantity);
        if (!quantity.greaterThan(0) || quantity.decimalPlaces() > 3) {
          throw new ConflictException('Quantité invalide.');
        }
        requested.set(key, (requested.get(key) ?? new Prisma.Decimal(0)).plus(quantity));
      }
      for (const [key, quantity] of requested) {
        const remaining = (ordered.get(key) ?? new Prisma.Decimal(0)).minus(
          delivered.get(key) ?? new Prisma.Decimal(0),
        );
        if (quantity.greaterThan(remaining)) {
          throw new ConflictException('Quantité supérieure au reliquat de commande.');
        }
      }
      return tx.deliveryNote.create({
        data: {
          number: `BL-${randomUUID().slice(0, 12).toUpperCase()}`,
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async confirm(orderId: string, deliveryId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.salesOrder.findUnique({
        where: { id: orderId },
        include: { lines: true, deliveries: { include: { lines: true } } },
      });
      if (!order) throw new NotFoundException('Commande introuvable.');
      if (order.status !== 'CONFIRMED' && order.status !== 'PARTIALLY_DELIVERED') {
        throw new ConflictException('Commande non livrable.');
      }
      const note = order.deliveries.find((item) => item.id === deliveryId);
      if (!note) throw new NotFoundException('Bon de livraison introuvable.');
      if (note.status !== 'DRAFT') throw new ConflictException('Bon déjà traité.');
      const stores = [...new Set(order.lines.map((line) => line.storeId))];
      const allowed = await tx.userStoreAccess.count({
        where: { userId: actorId, storeId: { in: stores } },
      });
      if (allowed !== stores.length) throw new ForbiddenException('Accès magasin refusé.');
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
        const key = `${line.storeId}:${line.productId}`;
        current.set(key, (current.get(key) ?? new Prisma.Decimal(0)).plus(line.quantity));
      }
      for (const [key, quantity] of current) {
        const total = ordered.get(key);
        if (!total || !quantity.greaterThan(0) || quantity.greaterThan(
          total.minus(delivered.get(key) ?? new Prisma.Decimal(0)),
        )) throw new ConflictException('Quantité de livraison supérieure au reliquat.');
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
            storeId, productId, type: 'DELIVERY', quantity,
            referenceType: 'DeliveryNote', referenceId: deliveryId,
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
        data: { actorId, action: 'DELIVERY_CONFIRMED', entityType: 'DeliveryNote', entityId: deliveryId },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancel(orderId: string, deliveryId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const note = await tx.deliveryNote.findFirst({
        where: { id: deliveryId, orderId },
        include: { order: { include: { lines: true } } },
      });
      if (!note) throw new NotFoundException('Bon de livraison introuvable.');
      if (note.status !== 'DRAFT') throw new ConflictException('Seul un brouillon peut être annulé.');
      const stores = [...new Set(note.order.lines.map((line) => line.storeId))];
      const allowed = await tx.userStoreAccess.count({
        where: { userId: actorId, storeId: { in: stores } },
      });
      if (allowed !== stores.length) throw new ForbiddenException('Accès magasin refusé.');
      const updated = await tx.deliveryNote.update({
        where: { id: deliveryId },
        data: { status: 'CANCELLED' },
        include: { lines: true },
      });
      await tx.auditLog.create({
        data: { actorId, action: 'DELIVERY_CANCELLED', entityType: 'DeliveryNote', entityId: deliveryId },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

}
