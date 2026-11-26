import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { paymentCents } from './payment.contract';

function invalid(): never {
  throw new Error('Affectations comptables incohérentes.');
}
const record = (value: unknown) => (isRecord(value) ? value : invalid());
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : invalid());
function cents(value: unknown): bigint {
  return typeof value === 'string' ? paymentCents(value) : invalid();
}
function money(value: bigint): string {
  if (value < 0n) return invalid();
  return (value / 100n).toString() + '.' + String(value % 100n).padStart(2, '0');
}
export function parseAllocations(value: unknown, orderId: string) {
  const root = record(value);
  if (root['orderId'] !== orderId) return invalid();
  const payments = array(root['payments']).map((raw) => {
    const row = record(raw);
    const id = storeId(row['id']);
    const amount = cents(row['amount']);
    const installment = row['installmentNumber'];
    if (typeof installment !== 'number' || !Number.isSafeInteger(installment) || installment < 1 || amount <= 0n)
      return invalid();
    const reversals = array(row['reversals']);
    if (reversals.length > 1 || (reversals.length && cents(record(reversals[0])['amount']) !== amount))
      return invalid();
    const allocations = array(row['allocations']).map((rawAllocation) => {
      const allocation = record(rawAllocation);
      const assigned = cents(allocation['amount']);
      if (assigned <= 0n) return invalid();
      return { id: storeId(allocation['id']), invoiceId: storeId(allocation['invoiceId']), amount: money(assigned) };
    });
    const assigned = allocations.reduce((sum, allocation) => sum + paymentCents(allocation.amount), 0n);
    if (reversals.length && allocations.length) return invalid();
    if (new Set(allocations.map((allocation) => allocation.invoiceId)).size !== allocations.length) return invalid();
    return { id, installment, active: reversals.length === 0, amount: money(amount), allocations,
      available: money(reversals.length ? 0n : amount - assigned) };
  });
  const invoices = array(root['invoices']).map((raw) => {
    const row = record(raw);
    const id = storeId(row['id']);
    const total = cents(row['totalTtc']);
    const number = row['number'];
    if (typeof number !== 'string' || !number.trim()) return invalid();
    const credited = array(row['creditNotes']).reduce<bigint>((sum, note) => sum + cents(record(note)['amount']), 0n);
    const allocations = array(row['allocations']).map((rawAllocation) => {
      const allocation = record(rawAllocation);
      const amount = cents(allocation['amount']);
      if (amount <= 0n) return invalid();
      return { id: storeId(allocation['id']), paymentId: storeId(allocation['paymentId']), amount: money(amount) };
    });
    return { id, number, total: money(total), credited: money(credited),
      remaining: money(total - credited - allocations.reduce((sum, item) => sum + paymentCents(item.amount), 0n)),
      allocations };
  });
  const fromPayments = payments.flatMap((payment) => payment.allocations.map((allocation) =>
    [allocation.id, payment.id, allocation.invoiceId, allocation.amount].join(':'))).sort();
  const fromInvoices = invoices.flatMap((invoice) => invoice.allocations.map((allocation) =>
    [allocation.id, allocation.paymentId, invoice.id, allocation.amount].join(':'))).sort();
  if (new Set(payments.map((payment) => payment.id)).size !== payments.length ||
    new Set(invoices.map((invoice) => invoice.id)).size !== invoices.length ||
    new Set(payments.flatMap((payment) => payment.allocations.map((allocation) => allocation.id))).size !== fromPayments.length ||
    fromPayments.length !== fromInvoices.length || fromPayments.some((key, index) => key !== fromInvoices[index])) return invalid();
  return { orderId, payments, invoices };
}
export type AllocationSnapshot = ReturnType<typeof parseAllocations>;
export function allocationInput(snapshot: AllocationSnapshot, paymentId: string, invoiceId: string, value: string) {
  const payment = snapshot.payments.find((item) => item.id === paymentId);
  const invoice = snapshot.invoices.find((item) => item.id === invoiceId);
  const amount = paymentCents(value.trim().replace(',', '.'));
  if (!payment?.active || !invoice || amount <= 0n || amount > paymentCents(payment.available) ||
    amount > paymentCents(invoice.remaining) || payment.allocations.some((item) => item.invoiceId === invoiceId))
    throw new Error('Montant ou facture incompatible avec le solde disponible.');
  return { invoiceId, amount: money(amount) };
}
