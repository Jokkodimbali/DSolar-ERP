import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Type } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AccessGuard, REQUIRED_PERMISSIONS } from './access.guard';
import { AUTHENTICATED_ONLY, INTERNAL_PERMISSIONS, PUBLIC_ROUTE } from './route-policy';

@Injectable()
export class RoutePolicyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const controller = context.getClass();
    const isPublic = this.reflector.get<boolean>(PUBLIC_ROUTE, handler) === true;
    const authOnly = this.reflector.get<boolean>(AUTHENTICATED_ONLY, handler) === true;
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [handler, controller]);
    const guards = [
      ...(this.reflector.get<Type<CanActivate>[]>(GUARDS_METADATA, controller) ?? []),
      ...(this.reflector.get<Type<CanActivate>[]>(GUARDS_METADATA, handler) ?? []),
    ];
    if (isPublic && !authOnly && !required?.length && !guards.includes(AccessGuard)) return true;
    if (!isPublic && guards.includes(AccessGuard)) {
      if (authOnly && !required?.length) return true;
      if (!authOnly && required?.length && required.every((permission) =>
        INTERNAL_PERMISSIONS.some((allowed) => allowed === permission))) return true;
    }
    // Fail closed even when a new controller accidentally omits AccessGuard.
    throw new ForbiddenException('Politique d’accès de la route invalide.');
  }
}
