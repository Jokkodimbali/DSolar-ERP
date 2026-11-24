import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

const SUCCESS_MESSAGE = 'dsolar.success_message';
export const SuccessMessage = (message: string) => SetMetadata(SUCCESS_MESSAGE, message);

/** Keep response bodies and existing API contracts unchanged. Encode UTF-8 in a safe ASCII header. */
@Injectable()
export class SuccessMessageInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}
  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next.handle();
    const response = context.switchToHttp().getResponse<Response>();
    const message =
      this.reflector.get<string>(SUCCESS_MESSAGE, context.getHandler()) ?? 'Opération effectuée avec succès.';
    return next.handle().pipe(
      tap(() => {
        if (!response.headersSent && response.statusCode >= 200 && response.statusCode < 300)
          response.setHeader('X-Success-Message', encodeURIComponent(message));
      }),
    );
  }
}
