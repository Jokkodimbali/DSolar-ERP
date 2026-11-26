import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import type { parseCreditPage } from '../domain/credit-note.contract';
import { CreditNotesApi } from '../infrastructure/credit-notes.api';
import { SalesDocumentButtonComponent } from './sales-document-button.component';

@Component({
  selector: 'app-credit-directory-page',
  imports: [
    DatePipe,
    RouterLink,
    FeedbackComponent,
    PageHeaderComponent,
    PaginationComponent,
    SalesDocumentButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './credit-directory.page.html',
})
export class CreditDirectoryPage {
  private readonly api = inject(CreditNotesApi);
  private readonly destroy = inject(DestroyRef);
  readonly result = signal<ReturnType<typeof parseCreditPage> | null>(null);
  readonly loading = signal(false);
  readonly query = signal('');
  readonly error = signal('');
  readonly money = formatMoney;
  constructor() {
    this.load(1);
  }
  search(value: string): void {
    if (this.loading()) return;
    this.query.set(value.trim());
    this.load(1);
  }
  load(page = this.result()?.page ?? 1): void {
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    this.result.set(null);
    this.api
      .search(page, this.query())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (result) => this.result.set(result),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
