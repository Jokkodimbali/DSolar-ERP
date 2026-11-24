export const NOTIFICATIONS = Symbol('NOTIFICATIONS');

export interface NotificationItem {
  id: string;
  title: string;
  action: string;
  entityType: string;
  entityId: string;
  storeId: string | null;
  createdAt: Date;
  read: boolean;
}

export interface NotificationFeed {
  enabled: boolean;
  unread: number;
  items: NotificationItem[];
}

export interface NotificationsPort {
  feed(actorId: string): Promise<NotificationFeed>;
  mark(actorId: string, id?: string): Promise<number>;
}
