import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, switchMap } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import {
  matchesDelivery,
  parseDelivery,
  parseDeliveryPage,
  parseDeliveryProgress,
  type DeliveryAction,
  type DeliveryInput,
} from '../domain/delivery.contract';

@Injectable({ providedIn: 'root' })
export class DeliveriesApi {
  private readonly http = inject(HttpClient);

  private path(orderId: string): string {
    return apiPath('/sales-orders/' + storeId(orderId) + '/deliveries');
  }
  progress(orderId: string) {
    return this.http
      .get<unknown>(this.path(orderId) + '/progress')
      .pipe(map((row) => parseDeliveryProgress(row, orderId)));
  }
  search(orderId: string, page: number) {
    return this.http
      .get<unknown>(apiPath('/deliveries/search'), { params: { orderId: storeId(orderId), page, limit: 10 } })
      .pipe(map((row) => parseDeliveryPage(row, orderId)));
  }
  create(orderId: string, input: DeliveryInput) {
    return this.http.post<unknown>(this.path(orderId), input).pipe(
      map((row) => {
        const note = parseDelivery(row, orderId);
        if (!matchesDelivery(note, input)) throw new Error('Bon enregistré différent de la demande.');
        return note;
      }),
    );
  }
  action(orderId: string, deliveryId: string, action: DeliveryAction) {
    const path = this.path(orderId) + '/' + storeId(deliveryId);
    return this.http.post<unknown>(path + '/' + action, {}).pipe(
      switchMap(() => this.http.get<unknown>(path)),
      map((row) => {
        const note = parseDelivery(row, orderId);
        if (note.id !== deliveryId || note.status !== (action === 'confirm' ? 'CONFIRMED' : 'CANCELLED'))
          throw new Error('État du bon non confirmé.');
        return note;
      }),
    );
  }
}
