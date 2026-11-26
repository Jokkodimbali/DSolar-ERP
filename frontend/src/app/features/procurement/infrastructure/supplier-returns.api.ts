import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, switchMap } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { parseId } from '../../inventory/domain/workflow.contract';
import { parseReturnOptions, type ReturnCreation } from '../domain/return-creation.contract';
import {
  parseSupplierReturn,
  parseSupplierReturnPage,
  type ReturnStatus,
  type ReturnAction,
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

  options(receiptId: string) {
    return this.http
      .get<unknown>(apiPath('/supplier-returns/receipts/' + storeId(receiptId) + '/options'))
      .pipe(map(parseReturnOptions));
  }

  create(input: ReturnCreation) {
    return this.http.post<unknown>(apiPath('/supplier-returns'), input).pipe(
      map(parseId),
      switchMap((id) => this.get(id)),
    );
  }

  action(id: string, action: ReturnAction) {
    const body =
      action.kind === 'cancel'
        ? { reason: action.reason }
        : action.kind === 'credit'
          ? { reference: action.reference }
          : {};
    return this.http
      .post<unknown>(apiPath('/supplier-returns/' + storeId(id) + '/' + action.kind), body)
      .pipe(switchMap(() => this.get(id)));
  }
}
