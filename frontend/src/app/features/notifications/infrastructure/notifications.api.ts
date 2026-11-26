import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import {
  notificationEvent,
  notificationId,
  parseFeed,
  parseMark,
  parseNotificationPage,
  type NotificationFeed,
} from '../domain/notification.contract';

@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly http = inject(HttpClient);

  feed() {
    return this.http.get<unknown>(apiPath('/notifications')).pipe(map(parseFeed));
  }

  history(page: number, read: '' | 'true' | 'false', search: string) {
    const limit = 30;
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (read) params = params.set('read', read);
    if (search.trim()) params = params.set('search', search.trim());
    return this.http
      .get<unknown>(apiPath('/notifications'), { params })
      .pipe(map((value) => parseNotificationPage(value, page, limit, read)));
  }

  mark(id?: string) {
    const path = id ? '/notifications/' + notificationId(id) + '/read' : '/notifications/read-all';
    return this.http.post<unknown>(apiPath(path), {}).pipe(map(parseMark));
  }

  stream(token: string): Observable<NotificationFeed> {
    return new Observable((subscriber) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 75000);
      const consume = async (): Promise<void> => {
        try {
          const response = await fetch(apiPath('/notifications/stream'), {
            headers: { Authorization: 'Bearer ' + token, Accept: 'text/event-stream' },
            signal: controller.signal,
            redirect: 'error',
            cache: 'no-store',
          });
          if (
            !response.ok ||
            !response.body ||
            !response.headers.get('Content-Type')?.includes('text/event-stream')
          )
            throw new Error('Flux de notifications indisponible.');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          try {
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done || subscriber.closed) break;
              buffer += decoder.decode(chunk.value, { stream: true });
              if (buffer.length > 512000) throw new Error('Message de notification trop volumineux.');
              const blocks = buffer.split(/\r?\n\r?\n/);
              buffer = blocks.pop() ?? '';
              for (const block of blocks) {
                const feed = notificationEvent(block);
                if (feed) subscriber.next(feed);
              }
            }
            subscriber.complete();
          } finally {
            reader.releaseLock();
          }
        } catch (error: unknown) {
          if (!subscriber.closed) subscriber.error(error);
        }
      };
      void consume();
      return () => {
        clearTimeout(timeout);
        controller.abort();
      };
    });
  }
}
