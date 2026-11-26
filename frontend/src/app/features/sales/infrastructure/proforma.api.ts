import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import { storeId } from '../../stores/domain/store.contract';
import {
  parseProforma,
  parseProformaPage,
  type ProformaAction,
  type ProformaStatus,
} from '../domain/proforma-view.contract';
import { type ProformaInput } from '../domain/proforma.contract';
import { CustomersApi } from './customers.api';
import { ProductsApi } from '../../products/infrastructure/products.api';
import { emptyFilters } from '../../products/domain/product.contract';
import type { Proforma } from '../domain/proforma-view.contract';
import { matchesProforma, type PendingProforma } from '../domain/pending-proforma.contract';
import { parseConvertedOrder, parseLinkedOrder } from '../domain/proforma-conversion.contract';

@Injectable({ providedIn: 'root' })
export class ProformaApi {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoresApi);
  private readonly customers = inject(CustomersApi);
  private readonly products = inject(ProductsApi);

  customerOptions(page: number, search: string) {
    return this.customers
      .search(page, search)
      .pipe(map((result) => ({ ...result, items: result.items.map(({ id, name }) => ({ id, name })) })));
  }

  productOptions(page: number, search: string) {
    return this.products.search(page, { ...emptyFilters, active: 'true', search }).pipe(
      map((result) => ({
        ...result,
        items: result.items.filter((item) => item.active).map(({ id, name, sku }) => ({ id, name, sku })),
      })),
    );
  }

  options(item: Proforma | null) {
    const ids = [...new Set(item?.lines.map((line) => line.productId) ?? [])];
    return forkJoin({
      customers: this.customerOptions(1, ''),
      products: this.productOptions(1, ''),
      stores: this.stores.list(true),
      selectedCustomer: item
        ? this.customers.get(item.customerId).pipe(map(({ id, name }) => ({ id, name })))
        : of(null),
      selectedProducts: ids.length
        ? forkJoin(ids.map((id) => this.products.get(id))).pipe(
            map((products) =>
              products.filter((product) => product.active).map(({ id, name, sku }) => ({ id, name, sku })),
            ),
          )
        : of([]),
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

  linkedOrder(source: Proforma) {
    return this.http
      .get<unknown>(apiPath('/sales-orders/search'), {
        params: { page: 1, limit: 2, proformaId: storeId(source.id) },
      })
      .pipe(map((value) => parseLinkedOrder(value, source)));
  }

  convert(source: Proforma) {
    return this.linkedOrder(source).pipe(
      switchMap((existing) => {
        if (existing) return of(existing);
        return this.http.post<unknown>(apiPath('/sales-orders/from-proforma/' + storeId(source.id)), {}).pipe(
          map((value) => parseConvertedOrder(value, source)),
          catchError((error: unknown) => {
            if (!(error instanceof HttpErrorResponse) || ![0, 409].includes(error.status))
              return throwError(() => error);
            return this.linkedOrder(source).pipe(
              map((order) => {
                if (!order) throw error;
                return order;
              }),
            );
          }),
        );
      }),
    );
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
