import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import {
  parseSupplierReturn,
  parseSupplierReturnPage,
  type ReturnStatus,
} from '../domain/supplier-return.contract';

@Injectable({ providedIn: 'root' })
export class SupplierReturnsApi {
  private readonly http = inject(HttpClient);
  search(page: number, search: string, status: ReturnStatus | '', store: string) {
    return this.http
      .get<unknown>(apiPath('/supplier-returns/search'), {
        params: {
          page,
          limit: 10,
          search,
          ...(status ? { status } : {}),
          ...(store ? { storeId: storeId(store) } : {}),
        },
      })
      .pipe(map(parseSupplierReturnPage));
  }
  get(id: string) {
    return this.http.get<unknown>(apiPath('/supplier-returns/' + storeId(id))).pipe(map(parseSupplierReturn));
  }
}
