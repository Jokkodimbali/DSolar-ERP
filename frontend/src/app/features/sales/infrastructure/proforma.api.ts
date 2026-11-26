import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { StoresApi } from '../../stores/infrastructure/stores.api';
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

  create(input: ProformaInput) {
    return this.http.post<unknown>(apiPath('/proformas'), input).pipe(map(parseCreatedProforma));
  }
}
