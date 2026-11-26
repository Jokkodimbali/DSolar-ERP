import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { supplierId } from '../domain/supplier.contract';
import {
  parsePurchaseOrder,
  parsePurchaseOrderPage,
  parsePurchaseProgress,
  type PurchaseOrderInput,
  type PurchaseStatus,
} from '../domain/purchase-order.contract';

@Injectable({ providedIn: 'root' })
export class PurchaseOrdersApi {
  private readonly http = inject(HttpClient);
  private path(id: string) {
    return apiPath('/purchase-orders/' + supplierId(id));
  }
  search(page: number, search: string, status: PurchaseStatus | '') {
    return this.http
      .get<unknown>(apiPath('/purchase-orders/search'), {
        params: { page, limit: 10, search, ...(status ? { status } : {}) },
      })
      .pipe(map(parsePurchaseOrderPage));
  }
  outstanding(page: number, search: string) {
    return this.http
      .get<unknown>(apiPath('/purchase-orders/search'), {
        params: { page, limit: 10, search, outstanding: true },
      })
      .pipe(map(parsePurchaseOrderPage));
  }
  get(id: string) {
    return this.http.get<unknown>(this.path(id)).pipe(map(parsePurchaseOrder));
  }
  progress(id: string) {
    return this.http.get<unknown>(this.path(id) + '/progress').pipe(map(parsePurchaseProgress));
  }
  create(input: PurchaseOrderInput) {
    return this.http.post<unknown>(apiPath('/purchase-orders'), input).pipe(map(parsePurchaseOrder));
  }
  action(id: string, action: 'confirm' | 'cancel') {
    return this.http.post<unknown>(this.path(id) + '/' + action, {}).pipe(map(parsePurchaseOrder));
  }
}
