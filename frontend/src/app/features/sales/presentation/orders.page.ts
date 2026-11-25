import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, finalize, of, switchMap } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import type { parseOrderDetail, parseOrderPage } from '../domain/order-view.contract';
import { OrderViewApi } from '../infrastructure/order-view.api';

@Component({
  selector: 'app-orders-page',
  imports: [PageHeaderComponent, FeedbackComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders.page.html',
})
export class OrdersPage {
  private readonly api = inject(OrderViewApi);
  private readonly destroy = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  readonly detail = signal<ReturnType<typeof parseOrderDetail> | null>(null);
  readonly result = signal<ReturnType<typeof parseOrderPage> | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly page = signal(1);
  readonly query = signal('');
  readonly detailMode = this.route.snapshot.paramMap.has('id');

  constructor() {
    if (this.detailMode) {
      this.route.paramMap.pipe(
        switchMap((params) => {
          this.detail.set(null);
          this.error.set('');
          this.loading.set(true);
          const id = params.get('id') ?? '';
          if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
            this.error.set('Référence de commande invalide.');
            this.loading.set(false);
            return of(null);
          }
          return this.api.detail(id).pipe(
            catchError((error: unknown) => { this.error.set(errorMessage(error)); return of(null); }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroy),
      ).subscribe((value) => this.detail.set(value));
    } else {
      this.load(1);
    }
  }

  search(value: string): void {
    this.query.set(value.trim());
    this.load(1);
  }

  load(page: number): void {
    if (this.loading() || page < 1) return;
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    this.page.set(page);
    this.api.list(page, this.query()).pipe(
      takeUntilDestroyed(this.destroy),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: (result) => this.result.set(result),
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }
}
