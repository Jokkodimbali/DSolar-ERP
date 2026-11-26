import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, finalize, forkJoin, switchMap } from 'rxjs';
import { errorMessage } from '../../../../core/api/http-error';
import { FeedbackComponent } from '../../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../../shared/ui/page-header.component';
import { formatMoney } from '../../../dashboard/domain/dashboard.contract';
import {
  sourceLabel,
  type parseAutomation,
  type parseBalance,
  type parseEntries,
  type parsePending,
  type parseSetup,
  type parseStatements,
} from '../domain/ledger.contract';
import { LedgerApi } from '../infrastructure/ledger.api';

interface Overview {
  balance: ReturnType<typeof parseBalance>;
  statements: ReturnType<typeof parseStatements>;
  automation: ReturnType<typeof parseAutomation>;
  pending: ReturnType<typeof parsePending>;
}

@Component({
  selector: 'app-ledger-page',
  imports: [DatePipe, FeedbackComponent, PageHeaderComponent],
  templateUrl: './ledger.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LedgerPage {
  private readonly api = inject(LedgerApi);
  private readonly destroy = inject(DestroyRef);
  readonly setup = signal<ReturnType<typeof parseSetup> | null>(null);
  readonly overview = signal<Overview | null>(null);
  readonly entries = signal<ReturnType<typeof parseEntries> | null>(null);
  readonly periodId = signal('');
  readonly accountId = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly money = formatMoney;
  readonly source = sourceLabel;
  readonly view = signal<'summary' | 'balance' | 'entries' | 'pending'>('summary');
  private cursors: (string | undefined)[] = [undefined];

  constructor() {
    this.load();
  }

  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.setup.set(null);
    this.overview.set(null);
    this.entries.set(null);
    this.api
      .setup()
      .pipe(
        switchMap((data) => {
          this.setup.set(data);
          const selected = data.periods.find((item) => item.id === this.periodId()) ?? data.periods[0];
          if (!selected) {
            this.periodId.set('');
            return EMPTY;
          }
          this.periodId.set(selected.id);
          this.accountId.set('');
          this.cursors = [undefined];
          return forkJoin({
            overview: this.api.overview(selected.id),
            entries: this.api.entries(selected.id),
          });
        }),
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ overview, entries }) => {
          this.overview.set(overview);
          this.entries.set(entries);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  select(id: string): void {
    if (this.loading() || !this.setup()?.periods.some((period) => period.id === id)) return;
    this.periodId.set(id);
    this.accountId.set('');
    this.cursors = [undefined];
    this.overview.set(null);
    this.entries.set(null);
    this.error.set('');
    this.loading.set(true);
    forkJoin({ overview: this.api.overview(id), entries: this.api.entries(id) })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ overview, entries }) => {
          this.overview.set(overview);
          this.entries.set(entries);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  filter(accountId: string): void {
    if (this.loading() || (accountId && !this.setup()?.accounts.some((item) => item.id === accountId)))
      return;
    this.accountId.set(accountId);
    this.readEntries([undefined]);
  }

  next(): void {
    const cursor = this.entries()?.nextCursor;
    if (cursor) this.readEntries([...this.cursors, cursor]);
  }

  previous(): void {
    if (this.cursors.length > 1) this.readEntries(this.cursors.slice(0, -1));
  }

  get pageNumber(): number {
    return this.cursors.length;
  }

  private readEntries(cursors: (string | undefined)[]): void {
    if (this.loading() || !this.periodId()) return;
    this.loading.set(true);
    this.error.set('');
    this.entries.set(null);
    this.api
      .entries(this.periodId(), this.accountId() || undefined, cursors[cursors.length - 1])
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (entries) => {
          this.cursors = cursors;
          this.entries.set(entries);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
