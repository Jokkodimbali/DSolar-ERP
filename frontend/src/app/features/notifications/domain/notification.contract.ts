import { isRecord } from '../../../core/api/api-contract';

export interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly read: boolean;
}
export interface NotificationFeed {
  readonly enabled: boolean;
  readonly unread: number;
  readonly items: readonly NotificationItem[];
}

function invalid(): never {
  throw new Error('Notifications serveur invalides.');
}

export function notificationId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value))
    return invalid();
  return value;
}

export function parseFeed(value: unknown): NotificationFeed {
  if (
    !isRecord(value) ||
    typeof value['enabled'] !== 'boolean' ||
    typeof value['unread'] !== 'number' ||
    !Number.isSafeInteger(value['unread']) ||
    value['unread'] < 0 ||
    !Array.isArray(value['items']) ||
    value['items'].length > 100
  )
    return invalid();
  const items = value['items'].map((item: unknown): NotificationItem => {
    if (
      !isRecord(item) ||
      typeof item['title'] !== 'string' ||
      !item['title'].trim() ||
      typeof item['createdAt'] !== 'string' ||
      !Number.isFinite(Date.parse(item['createdAt'])) ||
      typeof item['read'] !== 'boolean'
    )
      return invalid();
    return {
      id: notificationId(item['id']),
      title: item['title'],
      createdAt: item['createdAt'],
      read: item['read'],
    };
  });
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.filter((item) => !item.read).length > value['unread'] ||
    (!value['enabled'] && (items.length || value['unread']))
  )
    return invalid();
  return { enabled: value['enabled'], unread: value['unread'], items };
}

export function parseMark(value: unknown): string {
  if (
    !isRecord(value) ||
    typeof value['marked'] !== 'number' ||
    !Number.isSafeInteger(value['marked']) ||
    value['marked'] < 0 ||
    typeof value['message'] !== 'string' ||
    !value['message'].trim()
  )
    return invalid();
  return value['message'];
}

// Décode les messages SSE complets, sans interpréter les données comme du HTML.
export function notificationEvent(block: string): NotificationFeed | null {
  const lines = block.split(/\r?\n/);
  if (!lines.some((line) => line === 'event: notifications' || line === 'event:notifications')) return null;
  const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, ''));
  if (!data.length) return invalid();
  const parsed: unknown = JSON.parse(data.join('\n'));
  return parseFeed(parsed);
}
