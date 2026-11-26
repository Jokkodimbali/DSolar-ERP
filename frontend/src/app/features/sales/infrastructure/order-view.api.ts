import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, switchMap } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import {
  parseOrderDetail,
  parseOrderPage,
  type OrderAction,
  type OrderStatus,
} from '../domain/order-view.contract';

@Injectable({ providedIn: 'root' })
export class OrderViewApi {
  private readonly http = inject(HttpClient);

  list(page: number, search: string, status: OrderStatus | '' = '') {
    return this.http
      .get<unknown>(apiPath('/sales-orders/search'), {
        params: { page, limit: 20, search, ...(status ? { status } : {}) },
      })
      .pipe(map(parseOrderPage));
  }

  action(id: string, action: OrderAction) {
    return this.http
      .post<unknown>(apiPath('/sales-orders/' + storeId(id) + '/' + action), {})
      .pipe(switchMap(() => this.detail(id)));
  }

  detail(id: string) {
    return this.http
      .get<unknown>(apiPath('/sales-orders/' + storeId(id)))
      .pipe(map((value) => parseOrderDetail(value, id)));
  }
}
