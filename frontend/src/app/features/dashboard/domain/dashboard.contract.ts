import { isRecord } from '../../../core/api/api-contract';
type CountKey =
  | 'stores'
  | 'activeProducts'
  | 'customers'
  | 'suppliers'
  | 'confirmedOrders'
  | 'pendingPurchaseOrders'
  | 'issuedInvoices';
type MoneyKey = 'grossInvoiced' | 'creditNotes' | 'netInvoiced' | 'collected';
export type Overview = Record<CountKey, number> & Record<MoneyKey, string>;
export function parseOverview(value: unknown): Overview {
  if (!isRecord(value)) throw new Error('Indicateurs invalides.');
  const count = (key: CountKey): number => {
    const n = value[key];
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) throw new Error('Compteur invalide.');
    return n;
  };
  const amount = (key: MoneyKey): string => {
    const n = value[key];
    if (typeof n !== 'string' || !/^-?\d+(?:\.\d{1,2})?$/.test(n)) throw new Error('Montant invalide.');
    return n;
  };
  return {
    stores: count('stores'),
    activeProducts: count('activeProducts'),
    customers: count('customers'),
    suppliers: count('suppliers'),
    confirmedOrders: count('confirmedOrders'),
    pendingPurchaseOrders: count('pendingPurchaseOrders'),
    issuedInvoices: count('issuedInvoices'),
    grossInvoiced: amount('grossInvoiced'),
    creditNotes: amount('creditNotes'),
    netInvoiced: amount('netInvoiced'),
    collected: amount('collected'),
  };
}
export function formatMoney(value: string): string {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Montant invalide.');
  const [whole = '', fraction = ''] = value.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + ',' + fraction.padEnd(2, '0') + ' FCFA';
}
