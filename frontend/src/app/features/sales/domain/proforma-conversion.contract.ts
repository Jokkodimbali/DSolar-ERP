import { isRecord } from '../../../core/api/api-contract';
import { parsePage } from '../../inventory/domain/workflow.contract';
import { storeId } from '../../stores/domain/store.contract';
import type { Proforma } from './proforma-view.contract';

function invalid(): never {
  throw new Error('La commande associée ne correspond pas au devis.');
}

function equalDecimal(value: unknown, expected: string): boolean {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,4})?$/.test(value)) return false;
  const canonical = (raw: string) => {
    const [whole = '0', fraction = ''] = raw.split('.');
    return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
  };
  return canonical(value) === canonical(expected);
}

export function parseConvertedOrder(value: unknown, source: Proforma) {
  if (
    !isRecord(value) ||
    source.status !== 'ACCEPTED' ||
    value['proformaId'] !== source.id ||
    value['customerId'] !== source.customerId ||
    typeof value['number'] !== 'string' ||
    !value['number'].trim() ||
    !equalDecimal(value['total'], source.total) ||
    !Array.isArray(value['lines']) ||
    value['lines'].length !== source.lines.length
  )
    return invalid();
  const id = storeId(value['id']);
  const seen = new Set<string>();
  for (const raw of value['lines']) {
    if (!isRecord(raw) || raw['orderId'] !== id) return invalid();
    const key = storeId(raw['storeId']) + ':' + storeId(raw['productId']);
    const expected = source.lines.find((line) => line.storeId + ':' + line.productId === key);
    if (
      !expected ||
      seen.has(key) ||
      !equalDecimal(raw['quantity'], expected.quantity) ||
      !equalDecimal(raw['unitPrice'], expected.unitPrice) ||
      !equalDecimal(raw['discount'], expected.discount) ||
      !equalDecimal(raw['taxRate'], expected.taxRate) ||
      !equalDecimal(raw['lineTotal'], expected.lineTotal)
    )
      return invalid();
    seen.add(key);
  }
  return { id, number: value['number'] };
}

export type ConvertedOrder = ReturnType<typeof parseConvertedOrder>;

export function parseLinkedOrder(value: unknown, source: Proforma): ConvertedOrder | null {
  const page = parsePage(value, (row) => parseConvertedOrder(row, source));
  if (page.page !== 1 || page.total > 1 || page.items.length !== page.total) return invalid();
  return page.items[0] ?? null;
}
