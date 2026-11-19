import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PaymentsRepository, RecordPaymentInput } from '../application/payments.port';

@Injectable()
export class PrismaPaymentsRepository implements PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(orderId: string, actorId: string) {
    return this.prisma.payment.findMany({
      where: {
        orderId,
        order: {
          lines: {
            some: {},
            every: { store: { userAccess: { some: { userId: actorId } } } },
          },
        },
      },
      orderBy: { installmentNumber: 'asc' },
    });
  }

  async record(orderId: string, actorId: string, input: RecordPaymentInput) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.salesOrder.findUnique({
          where: { id: orderId },
          include: { lines: true, payments: { orderBy: { installmentNumber: 'asc' } } },
        });
        if (!order) throw new NotFoundException('Commande introuvable.');
        if (!['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'].includes(order.status)) {
          throw new ConflictException('La commande doit être confirmée.');
        }
        const stores = [...new Set(order.lines.map((line) => line.storeId))];
        const allowed = await tx.userStoreAccess.count({
          where: { userId: actorId, storeId: { in: stores } },
        });
        if (!stores.length || allowed !== stores.length) {
          throw new ForbiddenException('Accès magasin refusé.');
        }
        const previous = await tx.payment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (previous) {
          const reversalCount = await tx.paymentReversal.count({ where: { paymentId: previous.id } });
          if (reversalCount)
            throw new ConflictException('Encaissement contrepassé : nouvelle saisie requise.');
          if (
            previous.orderId !== orderId ||
            previous.receivedById !== actorId ||
            previous.method !== input.method ||
            previous.externalReference !== (input.externalReference ?? null) ||
            !previous.amount.equals(new Prisma.Decimal(input.amount))
          ) {
            throw new ConflictException('Clé idempotente déjà utilisée pour une autre opération.');
          }
          return previous;
        }
        const amount = new Prisma.Decimal(input.amount);
        if (!amount.isFinite() || !amount.greaterThan(0) || amount.decimalPlaces() > 2) {
          throw new ConflictException('Montant invalide.');
        }
        // Reversed installments retain their unique installment number: do not reuse slots silently.
        if (order.payments.length >= 2) {
          throw new ConflictException('Deux encaissements maximum par commande.');
        }
        const remaining = order.total.minus(order.amountPaid);
        if (amount.greaterThan(remaining)) {
          throw new ConflictException('Montant supérieur au solde de la commande.');
        }
        if (order.payments.length === 1 && !amount.equals(remaining)) {
          throw new ConflictException('La deuxième tranche doit solder la commande.');
        }
        const nextPaid = order.amountPaid.plus(amount);
        const payment = await tx.payment.create({
          data: {
            orderId,
            receivedById: actorId,
            installmentNumber: order.payments.length + 1,
            amount,
            method: input.method,
            externalReference: input.externalReference,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await tx.salesOrder.update({
          where: { id: orderId },
          data: {
            amountPaid: nextPaid,
            paymentStatus: nextPaid.equals(order.total) ? 'PAID' : 'PARTIALLY_PAID',
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'PAYMENT_RECEIVED',
            entityType: 'Payment',
            entityId: payment.id,
            payload: { orderId, amount: amount.toString(), method: input.method },
          },
        });
        return payment;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async reverse(orderId: string, paymentId: string, actorId: string, reason: string) {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) {
      throw new ConflictException('Un motif de contrepassation détaillé est obligatoire.');
    }
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.salesOrder.findUnique({
          where: { id: orderId },
          include: { lines: true },
        });
        if (!order) throw new NotFoundException('Commande introuvable.');
        const stores = [...new Set(order.lines.map((line) => line.storeId))];
        const allowed = await tx.userStoreAccess.count({
          where: { userId: actorId, storeId: { in: stores } },
        });
        if (!stores.length || allowed !== stores.length) {
          throw new ForbiddenException('Accès magasin refusé.');
        }
        const payment = await tx.payment.findFirst({
          where: { id: paymentId, orderId },
          include: { reversals: true, allocations: true },
        });
        if (!payment) throw new NotFoundException('Encaissement introuvable.');
        if (payment.allocations.length) {
          throw new ConflictException('Annuler les affectations comptables avant la contrepassation.');
        }
        if (payment.reversals.length) {
          throw new ConflictException('Encaissement déjà contrepassé.');
        }
        const laterActivePayments = await tx.payment.count({
          where: {
            orderId,
            installmentNumber: { gt: payment.installmentNumber },
            reversals: { none: {} },
          },
        });
        if (laterActivePayments) {
          throw new ConflictException('Contrepasser les versements ultérieurs avant celui-ci.');
        }
        if (order.amountPaid.lessThan(payment.amount)) {
          throw new ConflictException('Solde encaissé incohérent.');
        }
        const reversal = await tx.paymentReversal.create({
          data: { paymentId, amount: payment.amount, reason: normalizedReason },
        });
        const amountPaid = order.amountPaid.minus(payment.amount);
        await tx.salesOrder.update({
          where: { id: orderId },
          data: {
            amountPaid,
            paymentStatus: amountPaid.equals(0)
              ? 'UNPAID'
              : amountPaid.equals(order.total)
                ? 'PAID'
                : 'PARTIALLY_PAID',
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'PAYMENT_REVERSED',
            entityType: 'PaymentReversal',
            entityId: reversal.id,
            payload: { orderId, paymentId, amount: payment.amount.toString(), reason: normalizedReason },
          },
        });
        return reversal;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async allocate(orderId: string, paymentId: string, invoiceId: string, actorId: string, amountText: string) {
    const amount = new Prisma.Decimal(amountText);
    if (!amount.isFinite() || !amount.greaterThan(0) || amount.decimalPlaces() > 2) {
      throw new ConflictException('Montant affecté invalide.');
    }
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.salesOrder.findUnique({
          where: { id: orderId },
          include: { lines: true },
        });
        if (!order) throw new NotFoundException('Commande introuvable.');
        const stores = [...new Set(order.lines.map((line) => line.storeId))];
        const allowed = await tx.userStoreAccess.count({
          where: { userId: actorId, storeId: { in: stores } },
        });
        if (!stores.length || allowed !== stores.length) {
          throw new ForbiddenException('Accès magasin refusé.');
        }
        const payment = await tx.payment.findFirst({
          where: { id: paymentId, orderId },
          include: { allocations: true, reversals: true },
        });
        if (!payment) throw new NotFoundException('Encaissement introuvable.');
        if (payment.reversals.length) throw new ConflictException('Encaissement contrepassé.');
        // Serialize allocations and credit notes on the same invoice row.
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({
          where: { id: invoiceId, orderId, status: 'ISSUED' },
          include: { allocations: true, creditNotes: true },
        });
        if (!invoice) {
          throw new ConflictException('Facture émise liée à la commande introuvable.');
        }
        if (invoice.creditNotes.length) {
          throw new ConflictException('Facture avec avoir : affectation manuelle bloquée.');
        }
        const paymentAllocated = payment.allocations.reduce(
          (sum, allocation) => sum.plus(allocation.amount),
          new Prisma.Decimal(0),
        );
        const invoiceAllocated = invoice.allocations.reduce(
          (sum, allocation) => sum.plus(allocation.amount),
          new Prisma.Decimal(0),
        );
        if (amount.greaterThan(payment.amount.minus(paymentAllocated))) {
          throw new ConflictException('Affectation supérieure au montant disponible du règlement.');
        }
        const credited = invoice.creditNotes.reduce(
          (sum, note) => sum.plus(note.amount),
          new Prisma.Decimal(0),
        );
        if (amount.greaterThan(invoice.totalTtc.minus(invoiceAllocated).minus(credited))) {
          throw new ConflictException('Affectation supérieure au solde de la facture.');
        }
        if (payment.allocations.some((allocation) => allocation.invoiceId === invoiceId)) {
          throw new ConflictException('Règlement déjà affecté à cette facture.');
        }
        const allocation = await tx.paymentAllocation.create({
          data: { paymentId, invoiceId, amount },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'PAYMENT_ALLOCATED',
            entityType: 'PaymentAllocation',
            entityId: allocation.id,
            payload: { orderId, paymentId, invoiceId, amount: amount.toString() },
          },
        });
        return allocation;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
