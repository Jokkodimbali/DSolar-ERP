import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { type LoginInput, parseAuthResult } from '../domain/auth.contract';
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = new HttpClient(inject(HttpBackend));
  login(input: LoginInput) { return this.http.post<unknown>(apiPath('/auth/login'), input).pipe(map(parseAuthResult)); }
  refresh(refreshToken: string) { return this.http.post<unknown>(apiPath('/auth/refresh'), { refreshToken }).pipe(map(parseAuthResult)); }
  logout(refreshToken: string) { return this.http.post<unknown>(apiPath('/auth/logout'), { refreshToken }); }
}
