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

export interface NotificationQuery {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  read?: boolean;
  storeId?: string;
}

export interface NotificationFeed {
  enabled: boolean;
  unread: number;
  items: NotificationItem[];
  pagination?: { page: number; limit: number; total: number; pages: number };
}

export interface NotificationsPort {
  feed(actorId: string, query?: NotificationQuery): Promise<NotificationFeed>;
  mark(actorId: string, id?: string): Promise<number>;
}
