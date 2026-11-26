import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
  type OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { SessionService } from '../../auth/application/session.service';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import type { SupplierPurchases } from '../domain/supplier-purchases.contract';
import { SuppliersApi } from '../infrastructure/suppliers.api';

@Component({
  selector: 'app-supplier-purchases',
  imports: [FeedbackComponent],
  templateUrl: './supplier-purchases.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierPurchasesComponent implements OnInit {
  readonly supplierId = input.required<string>();
  private readonly api = inject(SuppliersApi);
  private readonly destroy = inject(DestroyRef);
  private readonly session = inject(SessionService);
  readonly loading = signal(false);
  readonly data = signal<SupplierPurchases | null>(null);
  readonly error = signal('');
  readonly money = formatMoney;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (this.loading() || !this.session.can('users.manage')) return;
    this.loading.set(true);
    this.data.set(null);
    this.error.set('');
    this.api
      .purchases(this.supplierId())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (data) => this.data.set(data),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
