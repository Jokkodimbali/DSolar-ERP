import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, map, switchMap, throwError } from 'rxjs';
import { SessionService } from '../../features/auth/application/session.service';
import { RetryRequiredError } from './http-error';
import { isInternalApi } from './api-contract';
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isInternalApi(request.url)) return next(request);
  const session = inject(SessionService);
  const token = session.accessToken();
  const generation = session.sessionVersion();
  if (!token) return next(request);
  const ensureSession = () => {
    if (session.sessionVersion() !== generation || !session.authenticated())
      throw new Error('Session fermée.');
  };
  const authorized = request.clone({ setHeaders: { Authorization: 'Bearer ' + token } });
  return next(authorized).pipe(
    map((event) => {
      ensureSession();
      return event;
    }),
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
      return session.refreshAfter(token, generation).pipe(
        switchMap((fresh) => {
          if (session.sessionVersion() !== generation || session.accessToken() !== fresh)
            return throwError(() => new Error('Session fermée.'));
          // Aucune mutation n’est rejouée automatiquement : l’utilisateur doit confirmer à nouveau.
          if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
            return throwError(() => new RetryRequiredError());
          return next(request.clone({ setHeaders: { Authorization: 'Bearer ' + fresh } })).pipe(
            map((event) => {
              ensureSession();
              return event;
            }),
            catchError((retry: unknown) => {
              if (
                retry instanceof HttpErrorResponse &&
                retry.status === 401 &&
                session.sessionVersion() === generation &&
                session.accessToken() === fresh
              )
                session.expire();
              return throwError(() => retry);
            }),
          );
        }),
      );
    }),
  );
};
