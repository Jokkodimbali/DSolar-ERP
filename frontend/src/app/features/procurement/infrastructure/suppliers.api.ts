import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import {
  parseSupplier,
  parseSupplierPage,
  supplierId,
  type SupplierFilter,
  type SupplierInput,
} from '../domain/supplier.contract';

@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly http = inject(HttpClient);

  search(page: number, search: string, status: SupplierFilter) {
    return this.http
      .get<unknown>(apiPath('/suppliers/search'), {
        params: { page, limit: 10, search, ...(status === 'ALL' ? {} : { active: status === 'ACTIVE' }) },
      })
      .pipe(map(parseSupplierPage));
  }

  get(id: string) {
    return this.http.get<unknown>(this.path(id)).pipe(map(parseSupplier));
  }

  create(input: SupplierInput, operationKey: string) {
    return this.http
      .post<unknown>(apiPath('/suppliers'), { ...input, operationKey })
      .pipe(map(parseSupplier));
  }

  update(id: string, input: SupplierInput) {
    return this.http.patch<unknown>(this.path(id), input).pipe(map(parseSupplier));
  }

  setActive(id: string, active: boolean) {
    const action = active ? '/activate' : '/deactivate';
    return this.http.post<unknown>(this.path(id) + action, {}).pipe(map(parseSupplier));
  }

  private path(id: string): string {
    return apiPath('/suppliers/' + supplierId(id));
  }
}
