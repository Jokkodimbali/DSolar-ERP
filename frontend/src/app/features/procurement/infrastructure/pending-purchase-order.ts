import { isRecord } from '../../../core/api/api-contract';
import { supplierId } from '../domain/supplier.contract';
import {
  purchaseOrderInput,
  type PurchaseOrder,
  type PurchaseOrderInput,
} from '../domain/purchase-order.contract';

export function purchaseStorageKey(actor: string): string {
  return 'dsolar.purchase.pending.v1:' + supplierId(actor);
}

export function parsePendingPurchase(value: unknown): PurchaseOrderInput {
  if (!isRecord(value) || typeof value['number'] !== 'string' || !Array.isArray(value['lines']))
    throw new Error('Commande en attente invalide.');
  const lines = value['lines'].map((line: unknown) => {
    if (!isRecord(line) || typeof line['quantity'] !== 'number' || typeof line['unitCost'] !== 'number')
      throw new Error('Ligne en attente invalide.');
    return {
      productId: supplierId(line['productId']),
      quantity: String(line['quantity']),
      unitCost: String(line['unitCost']),
    };
  });
  return purchaseOrderInput(value['number'], supplierId(value['supplierId']), lines);
}

export function matchesPurchase(order: PurchaseOrder, input: PurchaseOrderInput): boolean {
  return (
    order.number === input.number &&
    order.supplier.id === input.supplierId &&
    order.lines.length === input.lines.length &&
    input.lines.every((line) =>
      order.lines.some(
        (item) =>
          item.productId === line.productId &&
          Number(item.quantity) === line.quantity &&
          Number(item.unitCost) === line.unitCost,
      ),
    )
  );
}
