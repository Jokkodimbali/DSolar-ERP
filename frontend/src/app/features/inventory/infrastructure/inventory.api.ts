import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { parseBalance, parseStock, parseMovements, parseStockPage, parseStockSummary, type StockAdjustment } from '../domain/stock.contract';

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly http = inject(HttpClient);

  stock(id: string) {
    return this.http
      .get<unknown>(apiPath('/inventory/stores/' + storeId(id) + '/stock'))
      .pipe(map((value) => parseStock(value, id)));
  }

  search(id: string, page: number, search: string, availability: string) {
    return this.http.get<unknown>(apiPath('/inventory/stores/' + storeId(id) + '/stock/search'), {
      params: { page, limit: 10, search, availability },
    }).pipe(map((value) => parseStockPage(value, id)));
  }

  summary(id: string) {
    return this.http.get<unknown>(apiPath('/inventory/stores/' + storeId(id) + '/summary')).pipe(map((value) => parseStockSummary(value, id)));
  }

  balance(id: string, productId: string) {
    return this.http.get<unknown>(apiPath('/inventory/stores/' + storeId(id) + '/products/' + storeId(productId))).pipe(map((value) => parseBalance(value, id, productId)));
  }

  movements(id: string, page: number, search: string) {
    return this.http
      .get<unknown>(apiPath('/inventory/stores/' + storeId(id) + '/movements/search'), {
        params: { page, limit: 10, search },
      })
      .pipe(map((value) => parseMovements(value, id)));
  }

  adjust(input: StockAdjustment) {
    return this.http
      .post<unknown>(apiPath('/inventory/adjustments'), input)
      .pipe(map((value) => parseBalance(value, input.storeId, input.productId)));
  }
}
