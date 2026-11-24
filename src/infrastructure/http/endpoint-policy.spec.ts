import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionContext, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { AccessGuard } from '../../modules/identity/presentation/access.guard';
import { LoginRateLimitGuard } from '../../modules/identity/presentation/login-rate-limit.guard';
import { RoutePolicyGuard } from '../../modules/identity/presentation/route-policy.guard';
import { AUTHENTICATED_ONLY, PUBLIC_ROUTE } from '../../modules/identity/presentation/route-policy';

function controllers(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return controllers(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('Inventaire automatique des routes du backend', () => {
  it('impose une politique explicite sur tous les contrôleurs et limite les exceptions publiques', async () => {
    const reflector = new Reflector();
    const policy = new RoutePolicyGuard(reflector);
    const publicRoutes: string[] = [];
    const identityRoutes: string[] = [];
    let count = 0;
    for (const file of controllers(join(__dirname, '../..'))) {
      const exports: Record<string, unknown> = await import(file);
      for (const candidate of Object.values(exports)) {
        if (typeof candidate !== 'function' || !Reflect.hasMetadata(PATH_METADATA, candidate)) continue;
        const controller = candidate as { new (...args: never[]): unknown; prototype: Record<string, unknown> };
        for (const name of new MetadataScanner().getAllMethodNames(controller.prototype)) {
          const handler = controller.prototype[name];
          if (typeof handler !== 'function' || !Reflect.hasMetadata(METHOD_METADATA, handler)) continue;
          const context = { getHandler: () => handler, getClass: () => controller } as unknown as ExecutionContext;
          const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
          const path = [Reflect.getMetadata(PATH_METADATA, controller), Reflect.getMetadata(PATH_METADATA, handler)]
            .join('/').split('/').filter(Boolean).join('/');
          const label = method + ' /' + path;
          expect({ route: label, allowed: policy.canActivate(context) }).toEqual({ route: label, allowed: true });
          count++;
          const guards = [
            ...(reflector.get(GUARDS_METADATA, controller) ?? []),
            ...(reflector.get(GUARDS_METADATA, handler) ?? []),
          ];
          if (reflector.get(PUBLIC_ROUTE, handler)) {
            publicRoutes.push(label);
            if (path.startsWith('auth/')) expect(guards).toContain(LoginRateLimitGuard);
          } else {
            expect(guards).toContain(AccessGuard);
            if (reflector.get(AUTHENTICATED_ONLY, handler)) identityRoutes.push(label);
          }
        }
      }
    }
    expect(count).toBeGreaterThan(100);
    expect(publicRoutes.sort()).toEqual(['GET /health','POST /auth/login','POST /auth/logout','POST /auth/refresh']);
    expect(identityRoutes).toEqual(['GET /auth/me']);
  });
});
