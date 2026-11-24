import { Prisma } from '@prisma/client';
import { SourceType } from '../domain/source-types';

export interface PendingSource {
  type: SourceType;
  id: string;
  date: Date;
}

// A single registry is shared by the reconciliation report, batch posting and closing.
export async function pendingSources(
  tx: Prisma.TransactionClient,
  start: Date,
  end: Date,
  limit: number,
): Promise<PendingSource[]> {
  return tx.$queryRaw<PendingSource[]>(Prisma.sql`
    WITH sources AS (
      SELECT 'INVOICE'::text AS type, id, "issuedAt" AS date, 1 AS priority
      FROM "Invoice" WHERE status = 'ISSUED' AND "totalTtc" > 0
      UNION ALL
      SELECT 'PAYMENT', id, "receivedAt", 2 FROM "Payment" WHERE amount > 0
      UNION ALL
      SELECT 'EXPENSE', id, "paidAt", 2 FROM "Expense"
      WHERE status IN ('PAID','REFUNDED') AND amount > 0
      UNION ALL
      SELECT 'GOODS_RECEIPT', r.id, r."receivedAt", 2 FROM "GoodsReceipt" r
      WHERE r.status = 'CONFIRMED' AND EXISTS (
        SELECT 1 FROM "GoodsReceiptLine" l WHERE l."receiptId" = r.id
        AND round(l.quantity * l."unitCost", 2) > 0
      )
      UNION ALL
      SELECT 'CREDIT_NOTE', id, "issuedAt", 3 FROM "CreditNote" WHERE amount > 0
      UNION ALL
      SELECT 'PAYMENT_REVERSAL', id, "createdAt", 3 FROM "PaymentReversal" WHERE amount > 0
      UNION ALL
      SELECT 'EXPENSE_REFUND', id, "endedAt", 3 FROM "Expense" WHERE status = 'REFUNDED' AND amount > 0
      UNION ALL
      SELECT 'SUPPLIER_RETURN', id, "confirmedAt", 3 FROM "SupplierReturn" WHERE status = 'CONFIRMED' AND total > 0
      UNION ALL
      SELECT 'CASH_TRANSFER', "transferKey", coalesce(min("createdAt") FILTER (WHERE amount < 0), min("createdAt")), 2
      FROM "CashMovement" WHERE "transferKey" IS NOT NULL GROUP BY "transferKey"
      UNION ALL
      SELECT 'CASH_MOVEMENT', m.id, m."createdAt", CASE WHEN m."reversalOfId" IS NULL THEN 2 ELSE 3 END
      FROM "CashMovement" m
      LEFT JOIN "CashMovement" original ON original.id = m."reversalOfId"
      WHERE m."transferKey" IS NULL AND m."paymentId" IS NULL AND original."paymentId" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Expense" e WHERE e."cashMovementId" IN (m.id, original.id)
          OR e."refundMovementId" = m.id
        )
    )
    SELECT s.type, s.id, s.date FROM sources s
    WHERE s.date >= ${start}::date AND s.date < (${end}::date + 1)
    AND NOT EXISTS (
      SELECT 1 FROM "LedgerEntry" e WHERE e."sourceType" = s.type
      AND e."sourceId" = s.id AND e."postedAt" IS NOT NULL
    )
    ORDER BY s.priority, s.date, s.type, s.id
    LIMIT ${limit}
  `);
}
