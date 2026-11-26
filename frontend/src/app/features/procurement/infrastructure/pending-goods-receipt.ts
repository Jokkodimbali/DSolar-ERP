import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import type { GoodsReceipt, ReceiptInput } from '../domain/goods-receipt.contract';
import { parsePendingPurchase } from './pending-purchase-order';

export function receiptStorageKey(actor: string): string {
  return 'dsolar.receipt.pending.v1:' + storeId(actor);
}

export function parsePendingReceipt(value: unknown): ReceiptInput {
  if (!isRecord(value)) throw new Error('Réception en attente invalide.');
  const input = parsePendingPurchase({ ...value, supplierId: value['purchaseOrderId'] });
  return {
    number: input.number,
    purchaseOrderId: input.supplierId,
    storeId: storeId(value['storeId']),
    lines: input.lines,
  };
}

export function matchesReceipt(receipt: GoodsReceipt, input: ReceiptInput): boolean {
  return (
    receipt.number === input.number &&
    receipt.purchaseOrderId === input.purchaseOrderId &&
    receipt.storeId === input.storeId &&
    receipt.lines.length === input.lines.length &&
    input.lines.every((line) =>
      receipt.lines.some(
        (item) =>
          item.productId === line.productId &&
          Number(item.quantity) === line.quantity &&
          Number(item.unitCost) === line.unitCost,
      ),
    )
  );
}
