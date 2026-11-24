import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { reverseReconciledCashPayment } from '../../treasury/infrastructure/cash-payment-reversal';
import { PaymentsRepository, RecordPaymentInput } from '../application/payments.port';

@Injectable()
export class PrismaPaymentsRepository implements PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStoreAccess(tx: Prisma.TransactionClient, stores: string[], actorId: string) {
    if (!stores.length) throw new ForbiddenException('Commande sans magasin autorisé.');
    const user = await tx.user.findUnique({
      where: { id: actorId },
      select: {
        status: true,
        roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE') throw new ForbiddenException('Utilisateur inactif.');
    const activeStores = await tx.store.count({
      where: { id: { in: stores }, status: 'ACTIVE' },
    });
    if (activeStores !== stores.length) throw new ForbiddenException('Magasin inactif.');
    if (user.roles.length > 0) return;
    const allowed = await tx.userStoreAccess.count({
      where: { userId: actorId, storeId: { in: stores }, store: { status: 'ACTIVE' } },
    });
    if (allowed !== stores.length) throw new ForbiddenException('Accès magasin refusé.');
  }

  async list(orderId: string, actorId: string) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: orderId },
      select: { lines: { select: { storeId: true } } },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    await this.assertStoreAccess(this.prisma, [...new Set(order.lines.map((line) => line.storeId))], actorId);
    return this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { installmentNumber: 'asc' },
    });
  }

  async record(orderId: string, actorId: string, input: RecordPaymentInput) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.salesOrder.findUnique({
          where: { id: orderId },
          include: {
            lines: true,
            payments: { include: { reversals: true }, orderBy: { installmentNumber: 'asc' } },
          },
        });
        if (!order) throw new NotFoundException('Commande introuvable.');
        if (!['CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED'].includes(order.status)) {
          throw new ConflictException('La commande doit être confirmée.');
        }
        const stores = [...new Set(order.lines.map((line) => line.storeId))];
        await this.assertStoreAccess(tx, stores, actorId);
        const amount = new Prisma.Decimal(input.amount);
        if (!amount.isFinite() || !amount.greaterThan(0) || amount.decimalPlaces() > 2) {
          throw new ConflictException('Montant invalide.');
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
            !previous.amount.equals(amount)
          ) {
            throw new ConflictException('Clé idempotente déjà utilisée pour une autre opération.');
          }
          return previous;
        }
        // Reversed installments retain their unique installment number: do not reuse slots silently.
        const activePayments = order.payments.filter((payment) => !payment.reversals?.length);
        if (activePayments.length >= 2) {
          throw new ConflictException('Deux encaissements actifs maximum par commande.');
        }
        const remaining = order.total.minus(order.amountPaid);
        if (amount.greaterThan(remaining)) {
          throw new ConflictException('Montant supérieur au solde de la commande.');
        }
        if (activePayments.length === 1 && !amount.equals(remaining)) {
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
            ...(stores.length === 1 ? { storeId: stores[0] } : {}),
            payload: { orderId, storeIds: stores, amount: amount.toString(), method: input.method },
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
        await this.assertStoreAccess(tx, stores, actorId);
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
        await reverseReconciledCashPayment(tx, payment.id, actorId, normalizedReason);
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
            ...(stores.length === 1 ? { storeId: stores[0] } : {}),
            payload: {
              orderId,
              storeIds: stores,
              paymentId,
              amount: payment.amount.toString(),
              reason: normalizedReason,
            },
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
        await this.assertStoreAccess(tx, stores, actorId);
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
            ...(stores.length === 1 ? { storeId: stores[0] } : {}),
            payload: { orderId, storeIds: stores, paymentId, invoiceId, amount: amount.toString() },
          },
        });
        return allocation;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async cancelAllocation(
    orderId: string,
    paymentId: string,
    allocationId: string,
    actorId: string,
    reason: string,
  ) {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) {
      throw new ConflictException('Un motif détaillé de désaffectation est obligatoire.');
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
        await this.assertStoreAccess(tx, stores, actorId);
        const allocation = await tx.paymentAllocation.findFirst({
          where: { id: allocationId, paymentId, payment: { orderId } },
          select: { id: true, invoiceId: true, amount: true },
        });
        if (!allocation) throw new NotFoundException('Affectation introuvable.');
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${allocation.invoiceId}::uuid FOR UPDATE`;
        const deleted = await tx.paymentAllocation.deleteMany({
          where: { id: allocationId, paymentId },
        });
        if (deleted.count !== 1) throw new ConflictException('Affectation déjà annulée.');
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'PAYMENT_ALLOCATION_CANCELLED',
            entityType: 'PaymentAllocation',
            entityId: allocation.id,
            ...(stores.length === 1 ? { storeId: stores[0] } : {}),
            payload: {
              orderId,
              storeIds: stores,
              paymentId,
              invoiceId: allocation.invoiceId,
              amount: allocation.amount.toString(),
              reason: normalizedReason,
            },
          },
        });
        return { id: allocation.id, cancelled: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
