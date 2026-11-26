import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map, switchMap } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import { storeId } from '../../stores/domain/store.contract';
import { parseProforma, parseProformaPage, type ProformaAction, type ProformaStatus } from '../domain/proforma-view.contract';
import { parseCreatedProforma, parseOptions, type ProformaInput } from '../domain/proforma.contract';

@Injectable({ providedIn: 'root' })
export class ProformaApi {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoresApi);

  options() {
    return forkJoin({
      customers: this.http.get<unknown>(apiPath('/customers')).pipe(map(parseOptions)),
      products: this.http
        .get<unknown>(apiPath('/products'), { params: { active: 'true' } })
        .pipe(map(parseOptions)),
      stores: this.stores.list(true),
    });
  }

  search(page: number, search: string, status: ProformaStatus | '') {
    return this.http
      .get<unknown>(apiPath('/proformas/search'), {
        params: { page, limit: 10, search, ...(status ? { status } : {}) },
      })
      .pipe(map(parseProformaPage));
  }

  get(id: string) {
    return this.http.get<unknown>(apiPath('/proformas/' + storeId(id))).pipe(map(parseProforma));
  }

  action(id: string, action: ProformaAction) {
    return this.http
      .post<unknown>(apiPath('/proformas/' + storeId(id) + '/' + action), {})
      .pipe(switchMap(() => this.get(id)));
  }

  create(input: ProformaInput) {
    return this.http.post<unknown>(apiPath('/proformas'), input).pipe(map(parseCreatedProforma));
  }
}
