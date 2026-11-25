import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { parseOrderDetail, parseOrderPage } from '../domain/order-view.contract';

@Injectable({ providedIn: 'root' })
export class OrderViewApi {
  private readonly http = inject(HttpClient);

  list(page: number, search: string) {
    return this.http
      .get<unknown>(apiPath('/sales-orders/search'), {
        params: { page, limit: 20, search },
      })
      .pipe(map(parseOrderPage));
  }

  detail(id: string) {
    return this.http
      .get<unknown>(apiPath('/sales-orders/' + storeId(id)))
      .pipe(map((value) => parseOrderDetail(value, id)));
  }
}
