export function validReturnQuantity(value: string): boolean {
  return typeof value === 'string' && /^\d{1,15}(\.\d{1,3})?$/.test(value) && /[1-9]/.test(value);
}
