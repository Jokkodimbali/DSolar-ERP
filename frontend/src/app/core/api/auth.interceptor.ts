import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { SessionService } from '../../features/auth/application/session.service';
import { isInternalApi } from './api-contract';
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isInternalApi(request.url)) return next(request);
  const session = inject(SessionService);
  const token = session.accessToken();
  if (!token) return next(request);
  const authorized = request.clone({ setHeaders: { Authorization: 'Bearer ' + token } });
  return next(authorized).pipe(catchError((error: unknown) => {
    if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
    return session.refreshAfter(token).pipe(switchMap(fresh => {
      if (session.accessToken() !== fresh) return throwError(() => new Error('Session fermée.'));
      // Le guard backend rejette le jeton avant le handler : un seul rejeu après renouvellement.
      return next(request.clone({ setHeaders: { Authorization: 'Bearer ' + fresh } })).pipe(
        catchError((retry: unknown) => {
          if (retry instanceof HttpErrorResponse && retry.status === 401 && session.accessToken() === fresh) session.expire();
          return throwError(() => retry);
        }),
      );
    }));
  }));
};
