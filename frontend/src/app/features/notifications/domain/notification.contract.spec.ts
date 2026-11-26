import { describe, expect, it } from 'vitest';
import { notificationEvent, parseFeed, parseMark } from './notification.contract';

const item = {
  id: 'c31ac59c-8148-4664-8745-496a9618f202',
  title: 'Magasin créé',
  createdAt: '2026-11-25T12:00:00.000Z',
  read: false,
};
const feed = { enabled: true, unread: 1, items: [item] };

describe('Notifications', () => {
  it('valide le flux SSE et les données HTTP', () => {
    expect(parseFeed(feed)).toEqual(feed);
    expect(notificationEvent('event: notifications\ndata: ' + JSON.stringify(feed))).toEqual(feed);
    expect(notificationEvent('event: heartbeat\ndata: {}')).toBeNull();
    expect(() => parseFeed({ ...feed, unread: 0 })).toThrow();
    expect(() => parseFeed({ ...feed, enabled: false })).toThrow();
    expect(() => parseFeed({ ...feed, items: [item, item] })).toThrow();
    expect(parseMark({ marked: 1, message: 'Notification lue.' })).toBe('Notification lue.');
  });
});
