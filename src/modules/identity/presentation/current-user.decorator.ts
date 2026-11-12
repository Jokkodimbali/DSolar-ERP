import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
export interface AuthenticatedRequest extends Request { identity?: { id: string }; }
export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.identity) throw new Error('Utilisateur authentifié manquant.');
  return request.identity.id;
});
