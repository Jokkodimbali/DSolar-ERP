import { isRecord } from '../../../core/api/api-contract';
import { supplierId } from './supplier.contract';

function invalid(): never {
  throw new Error('Synthèse des achats fournisseur incohérente.');
}
function money(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/.test(value)) return invalid();
  return value;
}
function cents(value: string): bigint {
  return BigInt(value.replace('.', ''));
}
function count(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return invalid();
  return value;
}
export function parseSupplierPurchases(value: unknown, id: string) {
  if (!isRecord(value) || supplierId(value['supplierId']) !== id ||
    value['currency'] !== 'XOF' || value['basis'] !== 'CONFIRMED_RECEIPTS_AND_RETURNS' ||
    value['payableBalance'] !== null || value['payableBalanceAvailable'] !== false ||
    typeof value['active'] !== 'boolean' || typeof value['supplierName'] !== 'string' ||
    !value['supplierName'].trim()) return invalid();
  const confirmedReceipts = count(value['confirmedReceipts']);
  const confirmedReturns = count(value['confirmedReturns']);
  const recordedCredits = count(value['recordedCredits']);
  const returnsAwaitingCredit = count(value['returnsAwaitingCredit']);
  const receivedValue = money(value['receivedValue']);
  const returnedValue = money(value['returnedValue']);
  const creditValue = money(value['creditValue']);
  const netReceivedValue = money(value['netReceivedValue']);
  if (cents(receivedValue) - cents(returnedValue) !== cents(netReceivedValue) ||
    cents(creditValue) > cents(returnedValue) ||
    BigInt(recordedCredits) + BigInt(returnsAwaitingCredit) > BigInt(confirmedReturns)) return invalid();
  return {
    supplierId: id, supplierName: value['supplierName'], active: value['active'],
    confirmedReceipts, confirmedReturns, recordedCredits, returnsAwaitingCredit,
    receivedValue, returnedValue, creditValue, netReceivedValue,
  };
}
export type SupplierPurchases = ReturnType<typeof parseSupplierPurchases>;
