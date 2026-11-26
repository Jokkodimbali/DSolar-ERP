import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SessionService } from '../../auth/application/session.service';
import {
  blankFilters,
  normalizeFilters,
  type AuditFilters,
  type parseAuditPage,
  type parseAuditSummary,
} from '../domain/audit.contract';
import { AuditApi } from '../infrastructure/audit.api';

@Component({
  selector: 'app-audit-page',
  imports: [DatePipe, FeedbackComponent, PageHeaderComponent],
  templateUrl: './audit.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditPage {
  private readonly api = inject(AuditApi);
  private readonly session = inject(SessionService);
  private readonly destroy = inject(DestroyRef);
  readonly draft = signal(blankFilters());
  readonly active = signal(blankFilters());
  readonly page = signal<ReturnType<typeof parseAuditPage> | null>(null);
  readonly summary = signal<ReturnType<typeof parseAuditSummary> | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly pageNumber = signal(1);
  private cursors: (string | undefined)[] = [undefined];

  constructor() {
    this.search();
  }

  update(key: keyof AuditFilters, value: string): void {
    this.draft.update((filters) => ({ ...filters, [key]: value }));
  }

  reset(): void {
    if (this.loading()) return;
    this.draft.set(blankFilters());
    this.search();
  }

  search(): void {
    if (this.loading() || !this.session.can('users.manage')) return;
    try {
      const filters = normalizeFilters(this.draft());
      this.active.set(filters);
      this.fetch([undefined]);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Filtres invalides.');
    }
  }

  next(): void {
    const cursor = this.page()?.nextCursor;
    if (cursor) this.fetch([...this.cursors, cursor]);
  }

  previous(): void {
    if (this.cursors.length > 1) this.fetch(this.cursors.slice(0, -1));
  }

  private fetch(cursors: (string | undefined)[]): void {
    if (this.loading() || !this.session.can('users.manage')) return;
    this.loading.set(true);
    this.error.set('');
    this.page.set(null);
    this.summary.set(null);
    const filters = this.active();
    forkJoin({
      page: this.api.list(filters, cursors[cursors.length - 1]),
      summary: this.api.summary(filters),
    })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ page, summary }) => {
          this.cursors = cursors;
          this.pageNumber.set(cursors.length);
          this.page.set(page);
          this.summary.set(summary);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
