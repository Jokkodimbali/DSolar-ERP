import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, EMPTY, finalize, repeat, retry, switchMap, tap } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { DismissOutsideDirective } from '../../../shared/ui/dismiss-outside.directive';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { UiIconComponent } from '../../../shared/ui/ui-icon.component';
import { SessionService } from '../../auth/application/session.service';
import type { NotificationFeed } from '../domain/notification.contract';
import { NotificationsApi } from '../infrastructure/notifications.api';

@Component({
  selector: 'app-notifications',
  imports: [DismissOutsideDirective, FeedbackComponent, EmptyStateComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications.component.html',
})
export class NotificationsComponent {
  private readonly api = inject(NotificationsApi);
  private readonly session = inject(SessionService);
  private readonly destroy = inject(DestroyRef);
  readonly feed = signal<NotificationFeed | null>(null);
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly connectionError = signal('');
  readonly mutationError = signal('');
  readonly success = signal('');
  private readonly generation = signal(0);

  constructor() {
    effect((cleanup) => {
      const epoch = this.session.sessionVersion();
      const authenticated = this.session.authenticated();
      this.generation();
      if (!authenticated) {
        this.feed.set(null);
        this.open.set(false);
        return;
      }
      const accept = (feed: NotificationFeed): void => {
        if (this.session.sessionVersion() !== epoch || !this.session.authenticated()) return;
        this.feed.set(feed);
        this.connectionError.set('');
      };
      const connection = defer(() => this.api.feed())
        .pipe(
          tap(accept),
          switchMap(() => {
            const token = this.session.accessToken();
            return token && this.session.sessionVersion() === epoch ? this.api.stream(token) : EMPTY;
          }),
          tap({
            next: accept,
            error: () =>
              this.connectionError.set('Connexion aux notifications interrompue. Reconnexion automatique…'),
          }),
          retry({ delay: 5000 }),
          repeat({ delay: 1000 }),
        )
        .subscribe();
      cleanup(() => connection.unsubscribe());
    });
  }

  dismiss(reason: 'outside' | 'escape', trigger: HTMLButtonElement): void {
    this.open.set(false);
    if (reason === 'escape') trigger.focus();
  }

  date(value: string): string {
    return new Intl.DateTimeFormat('fr-SN', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Africa/Dakar',
    }).format(new Date(value));
  }

  mark(id?: string): void {
    if (this.busy() || !this.session.authenticated() || !this.feed()?.enabled) return;
    const epoch = this.session.sessionVersion();
    this.busy.set(true);
    this.mutationError.set('');
    this.success.set('');
    this.api
      .mark(id)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (message) => {
          if (epoch !== this.session.sessionVersion()) return;
          this.success.set(message);
          this.generation.update((value) => value + 1);
        },
        error: (error: unknown) => this.mutationError.set(errorMessage(error)),
      });
  }
}
