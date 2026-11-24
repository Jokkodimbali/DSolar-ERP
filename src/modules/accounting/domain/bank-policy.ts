import { aggregateCents, calendarDate } from './ledger-policy';

export interface BankStatementInput {
  bankAccountId: string;
  reference: string;
  start: string;
  end: string;
  opening: string;
  closing: string;
  lines: { reference: string; date: string; description: string; amount: string }[];
}

export function bankAmount(value: string): bigint {
  if (typeof value !== 'string' || !/^-?\d{1,16}(\.\d{1,2})?$/.test(value))
    throw new Error('Montant bancaire invalide.');
  return aggregateCents(value);
}

export function validateStatement(input: BankStatementInput) {
  const start = calendarDate(input.start);
  const end = calendarDate(input.end);
  if (start > end || input.lines.length > 500) throw new Error('Période ou taille de relevé invalide.');
  const refs = new Set<string>();
  let balance = bankAmount(input.opening);
  for (const line of input.lines) {
    const date = calendarDate(line.date);
    const amount = bankAmount(line.amount);
    if (
      !line.reference.trim() ||
      refs.has(line.reference.trim()) ||
      date < start ||
      date > end ||
      amount === 0n
    )
      throw new Error('Ligne bancaire invalide ou en double.');
    refs.add(line.reference.trim());
    balance += amount;
  }
  if (balance !== bankAmount(input.closing))
    throw new Error('Le solde final ne correspond pas aux mouvements.');
}
