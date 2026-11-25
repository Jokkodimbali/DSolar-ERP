// Only business operation drafts, never credentials or authentication tokens.
// Scope recovery to the authenticated actor and current browser tab.
import { storeId } from '../../stores/domain/store.contract';

export function pendingKey(actor: string, operation: 'adjustment' | 'receipt', context?: string): string {
  return ['dsolar.stock.pending.v1', storeId(actor), operation, ...(context ? [storeId(context)] : [])].join(':');
}

export function readPending<T>(key: string, parse: (value: unknown) => T): T | null {
  const raw = sessionStorage.getItem(key);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  return parse(value);
}

export function savePending<T>(key: string, command: T): void {
  sessionStorage.setItem(key, JSON.stringify(command));
}

export function clearPending(key: string): void {
  sessionStorage.removeItem(key);
}
