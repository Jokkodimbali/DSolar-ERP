import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, switchMap } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { parseAllocations } from '../domain/payment-allocation.contract';
import { paymentCents } from '../domain/payment.contract';

@Injectable({ providedIn: 'root' })
export class PaymentAllocationsApi {
  private readonly http = inject(HttpClient);
  private path(orderId: string) {
    return apiPath('/sales-orders/' + storeId(orderId) + '/payments');
  }
  snapshot(orderId: string) {
    return this.http
      .get<unknown>(this.path(orderId) + '/allocations')
      .pipe(map((value) => parseAllocations(value, orderId)));
  }
  allocate(orderId: string, paymentId: string, command: { invoiceId: string; amount: string }) {
    return this.http
      .post<unknown>(this.path(orderId) + '/' + storeId(paymentId) + '/allocations', command)
      .pipe(
        switchMap(() => this.snapshot(orderId)),
        map((snapshot) => {
          const item = snapshot.payments
            .find((payment) => payment.id === paymentId)
            ?.allocations.find((allocation) => allocation.invoiceId === command.invoiceId);
          if (!item || paymentCents(item.amount) !== paymentCents(command.amount))
            throw new Error('Affectation non vérifiée.');
          return snapshot;
        }),
      );
  }
  cancel(orderId: string, paymentId: string, allocationId: string, reason: string) {
    return this.http
      .post<unknown>(
        this.path(orderId) + '/' + storeId(paymentId) + '/allocations/' + storeId(allocationId) + '/cancel',
        { reason },
      )
      .pipe(
        switchMap(() => this.snapshot(orderId)),
        map((snapshot) => {
          const payment = snapshot.payments.find((item) => item.id === paymentId);
          if (!payment || payment.allocations.some((allocation) => allocation.id === allocationId))
            throw new Error('Annulation non vérifiée.');
          return snapshot;
        }),
      );
  }
}
