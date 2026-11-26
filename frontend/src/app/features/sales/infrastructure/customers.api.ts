import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { parseCustomer, parseCustomerPage, type CustomerInput } from '../domain/customer.contract';

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);

  search(page: number, search: string) {
    return this.http
      .get<unknown>(apiPath('/customers/search'), { params: { page, limit: 10, search } })
      .pipe(map(parseCustomerPage));
  }

  get(id: string) {
    return this.http.get<unknown>(apiPath('/customers/' + storeId(id))).pipe(map(parseCustomer));
  }

  create(input: CustomerInput, operationKey: string) {
    return this.http.post<unknown>(apiPath('/customers'), { ...input, operationKey }).pipe(map(parseCustomer));
  }

  update(id: string, input: CustomerInput) {
    return this.http.patch<unknown>(apiPath('/customers/' + storeId(id)), input).pipe(map(parseCustomer));
  }
}
