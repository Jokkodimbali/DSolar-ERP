import { describe, expect, it } from 'vitest';
import { parseNotificationPage } from './notification.contract';

describe('Historique des notifications', () => {
  const response = {
    enabled: true,
    unread: 1,
    items: [
      {
        id: 'c31ac59c-8148-4664-8745-496a9618f202',
        title: 'Stock faible',
        createdAt: '2026-11-26T10:00:00.000Z',
        read: false,
      },
    ],
    pagination: { page: 1, limit: 30, total: 1, pages: 1 },
  };

  it('contrôle les filtres et la pagination', () => {
    expect(parseNotificationPage(response, 1, 30, 'false').total).toBe(1);
    expect(() => parseNotificationPage(response, 1, 30, 'true')).toThrow();
    expect(() => parseNotificationPage(response, 2, 30, '')).toThrow();
    expect(() => parseNotificationPage({ ...response, pagination: null }, 1, 30, '')).toThrow();
  });
});
