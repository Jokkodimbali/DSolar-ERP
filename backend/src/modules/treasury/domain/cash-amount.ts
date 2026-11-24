/** Exact monetary input compatible with PostgreSQL Decimal(18,2). */
export function validCashAmount(value: string, signed = false, allowZero = true): boolean {
  if (typeof value !== 'string' || !/^-?\d{1,16}(?:\.\d{1,2})?$/.test(value)) return false;
  if (!signed && value.startsWith('-')) return false;
  return allowZero || /[1-9]/.test(value);
}
