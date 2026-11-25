import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { parseIdentity } from '../domain/auth.contract';

@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private readonly http = inject(HttpClient);
  me() {
    return this.http.get<unknown>(apiPath('/auth/me')).pipe(map(parseIdentity));
  }
}
