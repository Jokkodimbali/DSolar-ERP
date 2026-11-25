import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { parseIdentity } from '../../auth/domain/auth.contract';
import {
  parseAssignment,
  parseStore,
  parseStores,
  storeId,
  type CreateStore,
  type StoreStatus,
  type UpdateStore,
} from '../domain/store.contract';

@Injectable({ providedIn: 'root' })
export class StoresApi {
  private readonly http = inject(HttpClient);

  list(mine = false) {
    return this.http.get<unknown>(apiPath(mine ? '/stores/mine' : '/stores')).pipe(map(parseStores));
  }
  get(id: string) {
    return this.http.get<unknown>(this.path(id)).pipe(map(parseStore));
  }
  create(input: CreateStore) {
    return this.http.post<unknown>(apiPath('/stores'), input).pipe(map(parseStore));
  }
  update(id: string, input: UpdateStore) {
    return this.http.patch<unknown>(this.path(id), input).pipe(map(parseStore));
  }
  setStatus(id: string, status: StoreStatus) {
    const action = status === 'ACTIVE' ? '/activate' : '/deactivate';
    return this.http.patch<unknown>(this.path(id) + action, {}).pipe(map(parseStore));
  }
  users() {
    return this.http.get<unknown>(apiPath('/users')).pipe(
      map((value) => {
        if (!Array.isArray(value)) throw new Error('Liste des utilisateurs invalide.');
        return value.map(parseIdentity);
      }),
    );
  }
  assign(id: string, userId: string, assigned: boolean) {
    const path = this.path(id) + '/users/' + storeId(userId);
    const result = assigned ? this.http.post<unknown>(path, {}) : this.http.delete<unknown>(path);
    return result.pipe(map((value) => parseAssignment(value, id, userId, assigned)));
  }
  private path(id: string): string {
    return apiPath('/stores/' + storeId(id));
  }
}
