import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SalesDocument, SalesDocumentKind, SalesDocumentsPort } from '../application/sales-documents.port';

const customer = { select: { name: true, address: true, taxId: true, phone: true } } as const;
const product = { select: { name: true, sku: true } } as const;
const line = {
  quantity: true, unitPrice: true, discount: true, taxRate: true, lineTotal: true, product,
} as const;

type Line = {
  quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; discount: Prisma.Decimal;
  taxRate: Prisma.Decimal; lineTotal: Prisma.Decimal; product: { name: string; sku: string };
};

function documentLine(value: Line) {
  return {
    sku: value.product.sku, name: value.product.name, quantity: value.quantity.toFixed(3),
    unitPrice: value.unitPrice.toFixed(2), discount: value.discount.toFixed(2),
    taxRate: value.taxRate.toFixed(4), total: value.lineTotal.toFixed(2),
  };
}

@Injectable()
export class PrismaSalesDocumentsRepository implements SalesDocumentsPort {
  constructor(private readonly prisma: PrismaService) {}

  find(kind: SalesDocumentKind, id: string, actorId: string, orderId?: string): Promise<SalesDocument | null> {
    const scope = {
      lines: {
        some: {},
        every: { store: { status: 'ACTIVE' as const, userAccess: {
          some: { userId: actorId, user: { status: 'ACTIVE' as const } },
        } } },
      },
    };
    return this.prisma.$transaction(async (tx) => {
      if (kind === 'PROFORMA') {
        const item = await tx.proforma.findFirst({
          where: { id, ...scope },
          select: {
            number: true, status: true, issuedAt: true, expiresAt: true, total: true, customer,
            lines: { select: line, orderBy: { id: 'asc' } },
          },
        });
        if (!item) return null;
        const status = item.status === 'ISSUED' && item.expiresAt && item.expiresAt <= new Date()
          ? 'EXPIRED' : item.status;
        return {
          kind, number: item.number, status, issuedAt: item.issuedAt, expiresAt: item.expiresAt,
          customer: item.customer, lines: item.lines.map(documentLine), totalTtc: item.total.toFixed(2),
        };
      }
      if (kind === 'DELIVERY') {
        if (!orderId) return null;
        const item = await tx.deliveryNote.findFirst({
          where: { id, orderId, order: scope, ...scope },
          select: {
            number: true, status: true, deliveredAt: true,
            order: { select: { number: true, customer } },
            lines: {
              select: { quantity: true, product, store: { select: { name: true, code: true } } },
              orderBy: { id: 'asc' },
            },
          },
        });
        if (!item) return null;
        return {
          kind, number: item.number, status: item.status, issuedAt: item.deliveredAt,
          customer: item.order.customer, orderNumber: item.order.number,
          lines: item.lines.map((row) => ({
            sku: row.product.sku, name: row.product.name, quantity: row.quantity.toFixed(3),
            store: row.store.code + ' - ' + row.store.name,
          })),
        };
      }
      if (kind === 'PAYMENT') {
        if (!orderId) return null;
        const admin = await tx.user.findFirst({
          where: { id: actorId, status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
          select: { id: true },
        });
        const paymentScope = admin
          ? { lines: { some: {}, every: { store: { status: 'ACTIVE' as const } } } }
          : scope;
        const item = await tx.payment.findFirst({
          where: { id, orderId, order: paymentScope },
          select: {
            id: true, installmentNumber: true, amount: true, method: true,
            externalReference: true, receivedAt: true,
            order: { select: { number: true, customer } },
            reversals: { select: { amount: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
          },
        });
        if (!item) return null;
        return {
          kind, number: item.id, status: item.reversals.length ? 'REVERSED' : 'RECEIVED',
          issuedAt: item.receivedAt, customer: item.order.customer, orderNumber: item.order.number,
          installmentNumber: item.installmentNumber, amount: item.amount.toFixed(2),
          method: item.method, externalReference: item.externalReference,
          reversals: item.reversals.map((row) => ({ amount: row.amount.toFixed(2), createdAt: row.createdAt })),
        };
      }
      const item = await tx.invoice.findFirst({
        where: { id, order: scope },
        select: {
          number: true, status: true, issuedAt: true, customer, totalHt: true, totalTax: true, totalTtc: true,
          lines: { select: { ...line, taxAmount: true }, orderBy: { id: 'asc' } },
        },
      });
      if (!item) return null;
      return {
        kind, number: item.number, status: item.status, issuedAt: item.issuedAt, customer: item.customer,
        lines: item.lines.map((row) => ({ ...documentLine(row), taxAmount: row.taxAmount.toFixed(2) })),
        totalHt: item.totalHt.toFixed(2), totalTax: item.totalTax.toFixed(2), totalTtc: item.totalTtc.toFixed(2),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
