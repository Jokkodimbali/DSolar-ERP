import { Prisma } from '@prisma/client';

interface ReceivableGroup {
  status: string;
  count: bigint;
  gross: Prisma.Decimal;
  credited: Prisma.Decimal;
  paid: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  overpaid: Prisma.Decimal;
}

/** Aggregate at order level before grouping to avoid netting one customer's overpayment against another. */
export async function readReceivableGroups(tx: Prisma.TransactionClient, orderId?: string) {
  const rows = await tx.$queryRaw<ReceivableGroup[]>`
    WITH credits AS (
      SELECT i."orderId", SUM(c.amount) AS credited
      FROM "Invoice" i JOIN "CreditNote" c ON c."invoiceId" = i.id
      WHERE i.status = 'ISSUED'
      GROUP BY i."orderId"
    ), balances AS (
      SELECT o.total AS gross, COALESCE(c.credited, 0) AS credited, o."amountPaid" AS paid,
        o.total - COALESCE(c.credited, 0) - o."amountPaid" AS balance
      FROM "SalesOrder" o LEFT JOIN credits c ON c."orderId" = o.id
      WHERE o.status IN ('CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED')
        ${orderId ? Prisma.sql`AND o.id = ${orderId}::uuid` : Prisma.empty}
    ), classified AS (
      SELECT *, CASE WHEN balance < 0 THEN 'OVERPAID' WHEN balance = 0 THEN 'PAID'
        WHEN paid = 0 THEN 'UNPAID' ELSE 'PARTIALLY_PAID' END AS status
      FROM balances
    )
    SELECT status, COUNT(*) AS count, SUM(gross) AS gross, SUM(credited) AS credited,
      SUM(paid) AS paid, SUM(GREATEST(balance, 0)) AS outstanding,
      SUM(GREATEST(-balance, 0)) AS overpaid
    FROM classified GROUP BY status
  `;
  return rows.map((row) => ({
    status: row.status,
    count: Number(row.count),
    total: row.gross.toFixed(2),
    credited: row.credited.toFixed(2),
    paid: row.paid.toFixed(2),
    outstanding: row.outstanding.toFixed(2),
    overpaid: row.overpaid.toFixed(2),
  }));
}
