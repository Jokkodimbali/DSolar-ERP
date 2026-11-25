import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import {
  parseProduct,
  parseProductPage,
  parsePrices,
  parseReferences,
  type ProductInput,
  type ProductFilters,
  type ReferenceKind,
} from '../domain/product.contract';

@Injectable({ providedIn: 'root' })
export class ProductsApi {
  private readonly http = inject(HttpClient);
  private path(id: string) {
    return apiPath('/products/' + storeId(id));
  }

  search(page: number, filters: ProductFilters) {
    let params = new HttpParams().set('page', page).set('limit', 10);
    for (const [key, value] of Object.entries(filters)) {
      if (typeof value === 'string' && value) params = params.set(key, value);
    }
    return this.http.get<unknown>(apiPath('/products/search'), { params }).pipe(map(parseProductPage));
  }

  get(id: string) {
    return this.http.get<unknown>(this.path(id)).pipe(map(parseProduct));
  }

  create(sku: string, input: ProductInput) {
    return this.http.post<unknown>(apiPath('/products'), { ...input, sku }).pipe(map(parseProduct));
  }

  update(id: string, input: ProductInput) {
    return this.http.patch<unknown>(this.path(id), input).pipe(map(parseProduct));
  }

  status(id: string, active: boolean) {
    return this.http
      .patch<unknown>(this.path(id) + (active ? '/activate' : '/deactivate'), {})
      .pipe(map(parseProduct));
  }

  references(kind: ReferenceKind) {
    return this.http.get<unknown>(apiPath('/' + kind)).pipe(map((value) => parseReferences(value, kind)));
  }

  createReference(
    kind: ReferenceKind,
    input: { name: string; code?: string; parentId?: string; rate?: string; legalBasis?: string },
  ) {
    return this.http
      .post<unknown>(apiPath('/' + kind), input)
      .pipe(map((value) => parseReferences([value], kind)));
  }

  prices(id: string) {
    return this.http.get<unknown>(this.path(id) + '/prices').pipe(map(parsePrices));
  }

  setPrice(id: string, salePrice: string, purchasePrice?: string) {
    return this.http
      .post<unknown>(this.path(id) + '/prices', {
        salePrice,
        ...(purchasePrice === undefined ? {} : { purchasePrice }),
      })
      .pipe(map((value) => parsePrices([value])));
  }

  upload(id: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<unknown>(apiPath('/media/products/' + storeId(id) + '/photo'), body);
  }
}
