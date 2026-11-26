import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, switchMap } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { parsePaymentSummary, verifyRecordedPayment, type PaymentInput } from '../domain/payment.contract';

@Injectable({ providedIn: 'root' })
export class PaymentsApi {
  private readonly http = inject(HttpClient);
  private path(orderId: string) {
    return apiPath('/sales-orders/' + storeId(orderId) + '/payments');
  }
  summary(orderId: string) {
    return this.http
      .get<unknown>(this.path(orderId) + '/summary')
      .pipe(map((value) => parsePaymentSummary(value, orderId)));
  }
  record(orderId: string, input: PaymentInput) {
    return this.http.post<unknown>(this.path(orderId), input).pipe(
      map((value) => verifyRecordedPayment(value, orderId, input)),
      switchMap((id) =>
        this.summary(orderId).pipe(
          map((summary) => {
            if (!summary.payments.some((item) => item.id === id && item.status === 'ACTIVE'))
              throw new Error('Règlement non confirmé dans le récapitulatif.');
            return summary;
          }),
        ),
      ),
    );
  }
  reverse(orderId: string, paymentId: string, reason: string) {
    return this.http
      .post<unknown>(this.path(orderId) + '/' + storeId(paymentId) + '/reverse', { reason })
      .pipe(
        switchMap(() => this.summary(orderId)),
        map((summary) => {
          if (!summary.payments.some((item) => item.id === paymentId && item.status === 'REVERSED'))
            throw new Error('Contrepassation non confirmée.');
          return summary;
        }),
      );
  }
}
