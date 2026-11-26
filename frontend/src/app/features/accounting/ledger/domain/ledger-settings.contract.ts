import { storeId } from '../../../stores/domain/store.contract';
import { calendar } from '../../bank/domain/bank.contract';

export const classes = [
  { key: 'ASSET', label: 'Actif' },
  { key: 'LIABILITY', label: 'Passif / dettes' },
  { key: 'EQUITY', label: 'Capitaux propres' },
  { key: 'REVENUE', label: 'Produits' },
  { key: 'EXPENSE', label: 'Charges' },
] as const;

export type LedgerAction =
  | { kind: 'accounts' | 'journals'; code: string; name: string }
  | { kind: 'classify'; id: string; category: string }
  | { kind: 'periods'; name: string; start: string; end: string }
  | {
      kind: 'rules';
      key: string;
      journalId: string;
      debitAccountId: string;
      creditAccountId: string;
      taxAccountId?: string;
    }
  | { kind: 'automation' | 'close' | 'post-pending'; id: string };

function required(value: string, max: number): string {
  const result = value.trim();
  if (!result || result.length > max) throw new Error('Champ obligatoire ou longueur invalide.');
  return result;
}

export function codeAction(kind: 'accounts' | 'journals', code: string, name: string): LedgerAction {
  return { kind, code: required(code, 30), name: required(name, 160) };
}

export function periodAction(name: string, start: string, end: string): LedgerAction {
  const first = calendar(start);
  const last = calendar(end);
  if (first > last) throw new Error('La date de début doit précéder la fin.');
  return { kind: 'periods', name: required(name, 100), start: first, end: last };
}

export function classificationAction(id: string, category: string): LedgerAction {
  if (!classes.some((item) => item.key === category)) throw new Error('Classe comptable invalide.');
  return { kind: 'classify', id: storeId(id), category };
}

export function ruleAction(
  key: string,
  journalId: string,
  debitAccountId: string,
  creditAccountId: string,
  taxAccountId: string,
): LedgerAction {
  const normalized = required(key, 120);
  const method = '(CASH|BANK_TRANSFER|CHEQUE|MOBILE_MONEY|OTHER)';
  const valid =
    ['INVOICE', 'GOODS_RECEIPT', 'CASH_IN', 'CASH_OUT'].includes(normalized) ||
    /^CASH_TRANSFER:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$/.test(normalized) ||
    new RegExp('^PAYMENT:' + method + '$').test(normalized) ||
    new RegExp('^EXPENSE:' + method + ':[0-9a-fA-F-]{36}$').test(normalized);
  if (!valid) throw new Error('Clé de règle de comptabilisation invalide.');
  const ids = [
    storeId(debitAccountId),
    storeId(creditAccountId),
    ...(taxAccountId ? [storeId(taxAccountId)] : []),
  ];
  if (new Set(ids).size !== ids.length || (taxAccountId && normalized !== 'INVOICE'))
    throw new Error('Les comptes doivent être distincts ; la taxe est réservée aux factures.');
  return {
    kind: 'rules',
    key: normalized,
    journalId: storeId(journalId),
    debitAccountId,
    creditAccountId,
    ...(taxAccountId ? { taxAccountId } : {}),
  };
}
