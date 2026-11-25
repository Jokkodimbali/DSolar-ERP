import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import { parseAlerts, parseRecentOrders, type StoreAlerts } from '../domain/dashboard-operations.contract';

@Injectable({ providedIn: 'root' })
export class DashboardOperationsApi {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoresApi);

  alerts() {
    return this.stores.list().pipe(
      switchMap((stores) => {
        const active = stores.filter((store) => store.status === 'ACTIVE');
        if (!active.length) return of<StoreAlerts[]>([]);
        return forkJoin(
          active.map((store) =>
            this.http
              .get<unknown>(apiPath('/inventory/stores/' + store.id + '/alerts'), {
                params: { threshold: '5' },
              })
              .pipe(map((value) => parseAlerts(value, store.id, store.name))),
          ),
        );
      }),
    );
  }

  orders() {
    return this.http
      .get<unknown>(apiPath('/sales-orders/search'), { params: { page: 1, limit: 5 } })
      .pipe(map(parseRecentOrders));
  }
}
