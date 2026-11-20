import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { InvoicesRepository } from '../application/invoices.port';

@Injectable()
export class PrismaInvoicesRepository implements InvoicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // prettier-ignore
  private readonly visibleOrder = (actorId: string) => ({
    lines: {
      some: {},
      every: { store: { status: 'ACTIVE', userAccess: { some: { userId: actorId, user: { status: 'ACTIVE' } } } } },
    },
  });

  list(actorId: string) {
    return this.prisma.invoice.findMany({
      where: { order: this.visibleOrder(actorId) },
      include: { lines: true },
      orderBy: { number: 'desc' },
    });
  }

  find(id: string, actorId: string) {
    return this.prisma.invoice.findFirst({
      where: { id, order: this.visibleOrder(actorId) },
      include: { lines: true },
    });
  }

  async createFromOrder(orderId: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.salesOrder.findUnique({
          where: { id: orderId },
          include: { lines: true, invoices: true },
        });
        if (!order) throw new NotFoundException('Commande introuvable.');
        if (!['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'].includes(order.status)) {
          throw new ConflictException('Seule une commande confirmée peut être facturée.');
        }
        if (!order.lines.length) throw new ConflictException('Commande sans ligne.');
        if (order.invoices.length) throw new ConflictException('Commande déjà facturée.');
        const stores = [...new Set(order.lines.map((line) => line.storeId))];
        // prettier-ignore
        const authorized = await tx.userStoreAccess.count({
          where: { userId: actorId, user: { status: 'ACTIVE' }, storeId: { in: stores }, store: { status: 'ACTIVE' } },
        });
        if (authorized !== stores.length) {
          throw new ForbiddenException('Accès insuffisant aux magasins de la commande.');
        }
        const lines = order.lines.map((line) => {
          const net = line.quantity.mul(line.unitPrice).minus(line.discount);
          if (net.lessThan(0)) throw new ConflictException('Remise supérieure au montant brut.');
          const taxAmount = net.mul(line.taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          return {
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount,
            taxRate: line.taxRate,
            taxAmount,
            lineTotal: net.plus(taxAmount),
            net,
          };
        });
        const totalHt = lines.reduce((sum, line) => sum.plus(line.net), new Prisma.Decimal(0));
        const totalTax = lines.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0));
        const totalTtc = totalHt.plus(totalTax);
        if (!totalTtc.equals(order.total)) {
          throw new ConflictException('Total commande incohérent avec le calcul de la facture.');
        }
        const invoice = await tx.invoice.create({
          data: {
            number: `FAC-${randomUUID().slice(0, 12).toUpperCase()}`,
            customerId: order.customerId,
            orderId,
            totalHt,
            totalTax,
            totalTtc,
            lines: {
              create: lines.map(({ net: _net, ...line }) => line),
            },
          },
          include: { lines: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'INVOICE_CREATED',
            entityType: 'Invoice',
            entityId: invoice.id,
            payload: { orderId },
          },
        });
        return invoice;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async issue(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findUnique({
          where: { id },
          include: { order: { include: { lines: true } } },
        });
        if (!invoice) throw new NotFoundException('Facture introuvable.');
        if (invoice.status !== 'DRAFT') throw new ConflictException('Facture déjà traitée.');
        if (!invoice.order) throw new ConflictException('Facture sans commande.');
        const stores = [...new Set(invoice.order.lines.map((line) => line.storeId))];
        // prettier-ignore
        const authorized = await tx.userStoreAccess.count({
          where: { userId: actorId, user: { status: 'ACTIVE' }, storeId: { in: stores }, store: { status: 'ACTIVE' } },
        });
        if (!stores.length || authorized !== stores.length) {
          throw new ForbiddenException('Accès insuffisant aux magasins.');
        }
        const updated = await tx.invoice.update({
          where: { id },
          data: { status: 'ISSUED', issuedAt: new Date() },
          include: { lines: true },
        });
        await tx.auditLog.create({
          data: { actorId, action: 'INVOICE_ISSUED', entityType: 'Invoice', entityId: id },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async cancel(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findUnique({
          where: { id },
          include: { order: { include: { lines: true } }, allocations: true, creditNotes: true },
        });
        if (!invoice) throw new NotFoundException('Facture introuvable.');
        if (invoice.status !== 'DRAFT') {
          throw new ConflictException('Une facture émise doit être corrigée par un avoir.');
        }
        if (invoice.allocations.length || invoice.creditNotes.length) {
          throw new ConflictException('Facture déjà liée à des paiements ou avoirs.');
        }
        if (!invoice.order) throw new ConflictException('Facture sans commande.');
        const stores = [...new Set(invoice.order.lines.map((line) => line.storeId))];
        // prettier-ignore
        const authorized = await tx.userStoreAccess.count({
          where: { userId: actorId, user: { status: 'ACTIVE' }, storeId: { in: stores }, store: { status: 'ACTIVE' } },
        });
        if (!stores.length || authorized !== stores.length) {
          throw new ForbiddenException('Accès insuffisant aux magasins.');
        }
        const updated = await tx.invoice.update({
          where: { id },
          data: { status: 'CANCELLED' },
          include: { lines: true },
        });
        await tx.auditLog.create({
          data: { actorId, action: 'INVOICE_CANCELLED', entityType: 'Invoice', entityId: id },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
