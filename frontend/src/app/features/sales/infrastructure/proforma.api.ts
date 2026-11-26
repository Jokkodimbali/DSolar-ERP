import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map, switchMap } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import { storeId } from '../../stores/domain/store.contract';
import {
  parseProforma,
  parseProformaPage,
  type ProformaAction,
  type ProformaStatus,
} from '../domain/proforma-view.contract';
import { parseOptions, type ProformaInput } from '../domain/proforma.contract';
import { matchesProforma, type PendingProforma } from '../domain/pending-proforma.contract';

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

  create(input: PendingProforma) {
    return this.search(1, input.number, '').pipe(
      switchMap((page) => {
        const matches = page.items.filter((item) => item.number === input.number);
        if (page.pages > 1 || matches.length > 1)
          throw new Error('Recherche de la référence ambiguë. Vérifiez le devis existant.');
        const existing = matches[0];
        if (existing) return this.get(existing.id);
        return this.http.post<unknown>(apiPath('/proformas'), input).pipe(map(parseProforma));
      }),
      map((item) => {
        if (!matchesProforma(item, input))
          throw new Error('Le devis enregistré ne correspond pas à la demande en attente.');
        return item;
      }),
    );
  }

  update(id: string, input: ProformaInput) {
    return this.http.put<unknown>(apiPath('/proformas/' + storeId(id)), input).pipe(
      map(parseProforma),
      map((item) => {
        if (item.id !== id || item.status !== 'DRAFT' || !matchesProforma(item, input))
          throw new Error('Modification du devis non vérifiée.');
        return item;
      }),
    );
  }
}
