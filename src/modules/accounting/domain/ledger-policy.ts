export interface PostingLine {
  accountId: string;
  debit: string;
  credit: string;
}

export function cents(value: string): bigint {
  if (typeof value !== 'string' || !/^\d{1,16}(\.\d{1,2})?$/.test(value))
    throw new Error('Montant comptable invalide.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function assertBalanced(lines: PostingLine[]): void {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100)
    throw new Error('Deux à cent lignes requises.');
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    const d = cents(line.debit);
    const c = cents(line.credit);
    if (d > 0n === c > 0n) throw new Error('Débit ou crédit exclusif requis.');
    debit += d;
    credit += c;
  }
  if (debit !== credit) throw new Error('Écriture déséquilibrée.');
}

export function calendarDate(value: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date invalide.');
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Date invalide.');
  return date;
}
