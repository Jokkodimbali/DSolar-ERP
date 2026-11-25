import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { defer, firstValueFrom, from, map, timeout, type Observable } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { type LoginInput, parseBrowserAuthResult } from '../domain/auth.contract';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = new HttpClient(inject(HttpBackend));

  private browserRequest(path: string, input: object): Observable<unknown> {
    const request = () =>
      this.http.post<unknown>(apiPath('/auth/browser/' + path), input, {
        headers: { 'X-DSolar-Browser': '1' },
        withCredentials: true,
      }).pipe(timeout(15000));
    // Le verrou sérialise les rotations du cookie entre onglets du même origin.
    return defer(() => {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        return from(navigator.locks.request('dsolar-auth-session', () => firstValueFrom(request())));
      }
      return request();
    });
  }

  login(input: LoginInput) {
    return this.browserRequest('login', input).pipe(map(parseBrowserAuthResult));
  }

  refresh() {
    return this.browserRequest('refresh', {}).pipe(map(parseBrowserAuthResult));
  }

  logout() {
    return this.browserRequest('logout', {});
  }
}
