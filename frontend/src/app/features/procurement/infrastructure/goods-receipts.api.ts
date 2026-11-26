import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import {
  parseGoodsReceipt,
  parseReceiptPage,
  type ReceiptInput,
  type ReceiptStatus,
} from '../domain/goods-receipt.contract';

@Injectable({ providedIn: 'root' })
export class GoodsReceiptsApi {
  private readonly http = inject(HttpClient);

  search(page: number, search: string, status: ReceiptStatus | '', store: string) {
    return this.http
      .get<unknown>(apiPath('/goods-receipts/search'), {
        params: {
          page,
          limit: 10,
          search,
          ...(status ? { status } : {}),
          ...(store ? { storeId: storeId(store) } : {}),
        },
      })
      .pipe(map(parseReceiptPage));
  }

  get(id: string) {
    return this.http.get<unknown>(this.path(id)).pipe(map(parseGoodsReceipt));
  }

  create(input: ReceiptInput) {
    return this.http.post<unknown>(apiPath('/goods-receipts'), input).pipe(map(parseGoodsReceipt));
  }

  action(id: string, action: 'confirm' | 'cancel') {
    return this.http.post<unknown>(this.path(id) + '/' + action, {}).pipe(map(parseGoodsReceipt));
  }

  private path(id: string) {
    return apiPath('/goods-receipts/' + storeId(id));
  }
}
