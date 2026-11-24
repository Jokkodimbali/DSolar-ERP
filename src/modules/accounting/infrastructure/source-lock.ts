import { Prisma } from '@prisma/client';
import { SourceType } from '../domain/source-types';

export async function lockSource(tx: Prisma.TransactionClient, type: SourceType, id: string): Promise<void> {
  switch (type) {
    case 'INVOICE':
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id}::uuid FOR UPDATE`;
      break;
    case 'CREDIT_NOTE':
      await tx.$queryRaw`SELECT id FROM "CreditNote" WHERE id = ${id}::uuid FOR UPDATE`;
      break;
    case 'PAYMENT':
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${id}::uuid FOR UPDATE`;
      break;
    case 'PAYMENT_REVERSAL':
      await tx.$queryRaw`SELECT id FROM "PaymentReversal" WHERE id = ${id}::uuid FOR UPDATE`;
      break;
    case 'EXPENSE':
    case 'EXPENSE_REFUND':
      await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id}::uuid FOR UPDATE`;
      break;
    case 'GOODS_RECEIPT':
      await tx.$queryRaw`SELECT id FROM "GoodsReceipt" WHERE id = ${id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "GoodsReceiptLine" WHERE "receiptId" = ${id}::uuid ORDER BY id FOR UPDATE`;
      break;
    case 'SUPPLIER_RETURN':
      await tx.$queryRaw`SELECT id FROM "SupplierReturn" WHERE id = ${id}::uuid FOR UPDATE`;
      break;
    case 'CASH_MOVEMENT':
      await tx.$queryRaw`SELECT id FROM "CashMovement" WHERE id = ${id}::uuid FOR UPDATE`;
      break;
    case 'CASH_TRANSFER':
      await tx.$queryRaw`SELECT id FROM "CashMovement" WHERE "transferKey" = ${id}::uuid ORDER BY id FOR UPDATE`;
      break;
  }
}
