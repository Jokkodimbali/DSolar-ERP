import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';

export interface AuditFilters {
  actorId: string;
  storeId: string;
  entityId: string;
  entityType: string;
  action: string;
  from: string;
  to: string;
}

export function blankFilters(): AuditFilters {
  return { actorId: '', storeId: '', entityId: '', entityType: '', action: '', from: '', to: '' };
}

function invalid(): never {
  throw new Error('Données du journal d’audit incohérentes.');
}

const record = (value: unknown) => (isRecord(value) ? value : invalid());
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : invalid());
const text = (value: unknown): string => (typeof value === 'string' && value.trim() ? value : invalid());
const nullableId = (value: unknown) => (value === null ? null : storeId(value));
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();

function date(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error('Date de recherche invalide.');
  return value;
}

export function normalizeFilters(input: AuditFilters): AuditFilters {
  const result = blankFilters();
  for (const key of ['actorId', 'storeId'] as const) {
    const value = input[key].trim();
    result[key] = value ? storeId(value) : '';
  }
  for (const key of ['action', 'entityType', 'entityId'] as const) {
    const value = input[key].trim();
    if (value.length > 120) throw new Error('Le filtre ne doit pas dépasser 120 caractères.');
    result[key] = value;
  }
  result.from = input.from ? date(input.from) : '';
  result.to = input.to ? date(input.to) : '';
  if (result.from && result.to && result.from > result.to)
    throw new Error('La date de début doit précéder la date de fin.');
  return result;
}

export function parseAuditPage(value: unknown, filters: AuditFilters, limit: number) {
  const data = record(value);
  const items = array(data['items']).map((raw) => {
    const row = record(raw);
    const createdAt = text(row['createdAt']);
    if (!Number.isFinite(Date.parse(createdAt))) return invalid();
    const day = new Date(createdAt).toISOString().slice(0, 10);
    const item = {
      id: storeId(row['id']),
      actorId: nullableId(row['actorId']),
      storeId: nullableId(row['storeId']),
      action: text(row['action']),
      entityType: text(row['entityType']),
      entityId: text(row['entityId']),
      createdAt,
    };
    if (
      (filters.actorId && item.actorId !== filters.actorId) ||
      (filters.storeId && item.storeId !== filters.storeId) ||
      (filters.action && item.action !== filters.action) ||
      (filters.entityType && item.entityType !== filters.entityType) ||
      (filters.entityId && item.entityId !== filters.entityId) ||
      (filters.from && day < filters.from) ||
      (filters.to && day > filters.to)
    )
      return invalid();
    return item;
  });
  const nextCursor = nullableId(data['nextCursor']);
  if (
    items.length > limit ||
    new Set(items.map((item) => item.id)).size !== items.length ||
    (nextCursor !== null && (items.length !== limit || items[items.length - 1]?.id !== nextCursor))
  )
    return invalid();
  return { items, nextCursor };
}

export function parseAuditSummary(value: unknown) {
  const data = record(value);
  const total = count(data['total']);
  function groups(raw: unknown, key: string) {
    const rows = array(raw).map((item) => {
      const row = record(item);
      return { label: text(row[key]), count: count(row['count']) };
    });
    if (
      new Set(rows.map((row) => row.label)).size !== rows.length ||
      rows.some((row) => !row.count) ||
      rows.reduce((sum, row) => sum + BigInt(row.count), 0n) !== BigInt(total)
    )
      return invalid();
    return rows;
  }
  return {
    total,
    byAction: groups(data['byAction'], 'action'),
    byEntityType: groups(data['byEntityType'], 'entityType'),
  };
}
