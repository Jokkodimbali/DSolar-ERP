import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import type { parseNotificationPage } from '../domain/notification.contract';
import { NotificationsApi } from '../infrastructure/notifications.api';

@Component({
  selector: 'app-notifications-page',
  imports: [DatePipe, FeedbackComponent, PageHeaderComponent],
  templateUrl: './notifications.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPage {
  private readonly api = inject(NotificationsApi);
  private readonly destroy = inject(DestroyRef);
  readonly data = signal<ReturnType<typeof parseNotificationPage> | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly read = signal<'' | 'true' | 'false'>('');
  readonly search = signal('');

  constructor() {
    this.load(1);
  }

  filter(read: string, search: string): void {
    if (this.busy()) return;
    if (read !== '' && read !== 'true' && read !== 'false') return;
    this.read.set(read);
    this.search.set(search.trim());
    this.load(1);
  }

  load(page: number): void {
    if (this.busy() || page < 1) return;
    this.busy.set(true);
    this.error.set('');
    this.data.set(null);
    this.api
      .history(page, this.read(), this.search())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (value) => this.data.set(value),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  mark(id?: string): void {
    const data = this.data();
    if (this.busy() || !data?.enabled || !data.unread) return;
    if (id && !data.items.some((item) => item.id === id && !item.read)) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    this.api
      .mark(id)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (message) => {
          this.busy.set(false);
          this.success.set(message);
          this.load(1);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(errorMessage(error));
        },
      });
  }
}
