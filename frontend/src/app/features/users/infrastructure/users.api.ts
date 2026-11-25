import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { parseIdentity } from '../../auth/domain/auth.contract';
import { storeId } from '../../stores/domain/store.contract';
import { parseUsers, type UserAccess } from '../domain/users.contract';

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<unknown>(apiPath('/users')).pipe(map(parseUsers));
  }

  create(input: UserAccess & { email: string; fullName: string; password: string }) {
    return this.http.post<unknown>(apiPath('/users'), input).pipe(map(parseIdentity));
  }

  access(id: string, input: UserAccess) {
    return this.http
      .patch<unknown>(apiPath('/users/' + storeId(id) + '/access'), input)
      .pipe(map(parseIdentity));
  }

  disable(id: string) {
    return this.http.patch<void>(apiPath('/users/' + storeId(id) + '/disable'), {});
  }
}
