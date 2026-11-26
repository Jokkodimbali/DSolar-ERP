export const SOURCE_TYPES = [
  'INVOICE',
  'CREDIT_NOTE',
  'CASH_TRANSFER',
  'PAYMENT',
  'PAYMENT_REVERSAL',
  'EXPENSE',
  'EXPENSE_REFUND',
  'GOODS_RECEIPT',
  'SUPPLIER_RETURN',
  'CASH_MOVEMENT',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface PostingRuleInput {
  key: string;
  journalId: string;
  debitAccountId: string;
  creditAccountId: string;
  taxAccountId?: string;
}

export function validRuleKey(key: string): boolean {
  const method = '(CASH|BANK_TRANSFER|CHEQUE|MOBILE_MONEY|OTHER)';
  return (
    ['INVOICE', 'GOODS_RECEIPT', 'CASH_IN', 'CASH_OUT'].includes(key) ||
    /^CASH_TRANSFER:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$/.test(key) ||
    new RegExp('^PAYMENT:' + method + '$').test(key) ||
    new RegExp('^EXPENSE:' + method + ':[0-9a-fA-F-]{36}$').test(key)
  );
}
