import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { UiIconComponent } from '../../../shared/ui/ui-icon.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { errorMessage } from '../../../core/api/http-error';
import type { ReportDefinition, ReportView } from '../domain/dashboard-reports.contract';
import { DashboardReportsApi } from '../infrastructure/dashboard-reports.api';

@Component({
  selector: 'app-dashboard-report',
  imports: [FeedbackComponent, EmptyStateComponent, UiIconComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-report.component.html',
})
export class DashboardReportComponent implements OnInit {
  readonly definition = input.required<ReportDefinition>();
  readonly compact = input(false);
  private readonly api = inject(DashboardReportsApi);
  private readonly destroy = inject(DestroyRef);
  readonly year = signal(Math.min(2100, Math.max(2000, new Date().getFullYear())));
  readonly years = Array.from({ length: this.year() - 1999 }, (_, index) => this.year() - index);
  readonly limit = signal(20);
  readonly data = signal<ReportView | null>(null);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly exportError = signal('');

  ngOnInit(): void {
    if (this.definition().path === 'top-products') this.limit.set(10);
    this.load();
  }

  chartIsEmpty(chart: NonNullable<ReportView['chart']>): boolean {
    return chart.every((bar) => bar.height === 0);
  }

  changeYear(value: string): void {
    const year = Number(value);
    if (!this.years.includes(year) || this.loading()) return;
    this.year.set(year);
    this.load();
  }

  changeLimit(value: string): void {
    const limit = Number(value);
    if (![10, 20, 50].includes(limit) || this.loading()) return;
    this.limit.set(limit);
    this.load();
  }

  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.data.set(null);
    this.api
      .report(this.definition(), this.year(), this.limit())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (value) => this.data.set(value),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  download(): void {
    const name = this.definition().exportName;
    if (!name || this.exporting()) return;
    this.exporting.set(true);
    this.exportError.set('');
    this.api
      .export(name)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.exporting.set(false)),
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = name;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        error: (error: unknown) => this.exportError.set(errorMessage(error)),
      });
  }
}
