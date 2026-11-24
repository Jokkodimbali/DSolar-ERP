import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SupplierPurchasesPort, SupplierPurchasesSnapshot } from '../application/supplier-purchases.port';

@Injectable()
export class PrismaSupplierPurchasesRepository implements SupplierPurchasesPort {
  constructor(private readonly prisma: PrismaService) {}

  snapshot(supplierId: string, actorId: string): Promise<SupplierPurchasesSnapshot> {
    return this.prisma.$transaction(
      async (tx) => {
        const admin = await tx.user.findFirst({
          where: { id: actorId, status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
          select: { id: true },
        });
        if (!admin) throw new ForbiddenException('Synthèse financière réservée aux administrateurs.');
        const supplier = await tx.supplier.findUnique({
          where: { id: supplierId },
          select: { id: true, name: true, active: true },
        });
        if (!supplier) throw new NotFoundException('Fournisseur introuvable.');
        // Independent aggregates avoid multiplying amounts through one-to-many joins.
        const [amounts] = await tx.$queryRaw<Omit<SupplierPurchasesSnapshot, 'supplierId' | 'supplierName' | 'active'>[]>`
          WITH receipts AS (
            SELECT r.id FROM "GoodsReceipt" r
            JOIN "PurchaseOrder" p ON p.id = r."purchaseOrderId"
            WHERE p."supplierId" = ${supplierId}::uuid AND r.status = 'CONFIRMED'
          ), received AS (
            SELECT coalesce(sum(round(l.quantity * l."unitCost", 2)), 0) AS value
            FROM "GoodsReceiptLine" l JOIN receipts r ON r.id = l."receiptId"
          ), returns AS (
            SELECT t.id, t.total FROM "SupplierReturn" t JOIN receipts r ON r.id = t."receiptId"
            WHERE t.status = 'CONFIRMED'
          ), returned AS (
            SELECT count(*) AS count, coalesce(sum(total), 0) AS value FROM returns
          ), credits AS (
            SELECT count(*) AS count, coalesce(sum(c.amount), 0) AS value
            FROM "SupplierReturnCredit" c JOIN returns t ON t.id = c."returnId"
            WHERE c."supplierId" = ${supplierId}::uuid
          )
          SELECT (SELECT count(*) FROM receipts)::text AS "confirmedReceipts",
            returned.count::text AS "confirmedReturns",
            credits.count::text AS "recordedCredits",
            round(received.value, 2)::text AS "receivedValue",
            round(returned.value, 2)::text AS "returnedValue",
            round(credits.value, 2)::text AS "creditValue",
            round(received.value - returned.value, 2)::text AS "netReceivedValue",
            (SELECT count(*) FROM returns t WHERE t.total > 0 AND NOT EXISTS (
              SELECT 1 FROM "SupplierReturnCredit" c
              WHERE c."returnId" = t.id AND c."supplierId" = ${supplierId}::uuid
            ))::text AS "returnsAwaitingCredit"
          FROM received CROSS JOIN returned CROSS JOIN credits
        `;
        return { supplierId: supplier.id, supplierName: supplier.name, active: supplier.active, ...amounts };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
