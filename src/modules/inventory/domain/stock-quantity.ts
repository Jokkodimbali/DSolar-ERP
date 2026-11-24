// Matches PostgreSQL Decimal(18,3) without implicit rounding or exponent notation.
export function validStockQuantity(value: string): boolean {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.test(value);
}
