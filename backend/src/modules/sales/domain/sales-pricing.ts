export interface SalesPriceInput {
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
}

const MAX_MONEY = 999999999999999999n;

function scaled(value: string, decimals: number, maxWhole: number): bigint {
  if (!new RegExp('^\\d{1,' + maxWhole + '}(?:\\.\\d{1,' + decimals + '})?$').test(value))
    throw new Error('Montant ou précision commerciale invalide.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'));
}

function money(value: bigint): string {
  if (value < 0n || value > MAX_MONEY) throw new Error('Montant commercial hors limites.');
  return (value / 100n).toString() + '.' + String(value % 100n).padStart(2, '0');
}

// All amounts are nonnegative. Round half up, without binary floating point.
function round(value: bigint, divisor: bigint): bigint {
  return (value + divisor / 2n) / divisor;
}

export function calculateSalesLine(input: SalesPriceInput) {
  const quantity = scaled(input.quantity, 3, 15);
  const price = scaled(input.unitPrice, 2, 16);
  const discount = scaled(input.discount, 2, 16);
  const taxRate = scaled(input.taxRate, 4, 3);
  if (quantity === 0n || taxRate > 1000000n) throw new Error('Quantité ou taux invalide.');
  const rawNet = quantity * price - discount * 1000n;
  if (rawNet < 0n) throw new Error('La remise dépasse le montant de la ligne.');
  const net = round(rawNet, 1000n);
  const tax = round(net * taxRate, 1000000n);
  return { net: money(net), tax: money(tax), total: money(net + tax) };
}

export function calculateSalesTotals(lines: SalesPriceInput[]) {
  if (!lines.length || lines.length > 100) throw new Error('Une à cent lignes requises.');
  const calculated = lines.map(calculateSalesLine);
  const sum = (key: 'net' | 'tax' | 'total') =>
    money(calculated.reduce((acc, line) => acc + scaled(line[key], 2, 16), 0n));
  return { lines: calculated, totalHt: sum('net'), totalTax: sum('tax'), totalTtc: sum('total') };
}
