import type { SaleOption } from './proforma.contract';

export function keepSelected(
  previous: readonly SaleOption[],
  next: readonly SaleOption[],
  selected: readonly string[],
): SaleOption[] {
  const retained = previous.filter((item) => selected.includes(item.id));
  return [...new Map([...retained, ...next].map((item) => [item.id, item])).values()];
}

export function localExpiry(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Date de validité invalide.');
  const pad = (part: number) => String(part).padStart(2, '0');
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes()) +
    ':' +
    pad(date.getSeconds())
  );
}

export function expiryInput(value: string, original?: string | null, now = Date.now()): string | undefined {
  if (!value) return undefined;
  const normalized = value.length === 16 ? value + ':00' : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized))
    throw new Error('Date de validité invalide.');
  const date = original && localExpiry(original) === normalized ? new Date(original) : new Date(normalized);
  if (!Number.isFinite(date.getTime()) || localExpiry(date.toISOString()) !== normalized)
    throw new Error('Date de validité invalide.');
  if (date.getTime() <= now) throw new Error('La date de validité doit être future.');
  return date.toISOString();
}
