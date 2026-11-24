import 'reflect-metadata';
import { Controller, ExecutionContext, Get, INestApplication, UseGuards } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AccessGuard, RequirePermissions } from './access.guard';
import { RoutePolicyGuard } from './route-policy.guard';
import { AuthenticatedOnly, PublicRoute } from './route-policy';
import { SESSION_REPOSITORY, TOKEN_SERVICE, USER_REPOSITORY } from '../application/ports';

@Controller('policy-test')
class PolicyTestController {
  @Get('forgotten')
  forgotten() {
    return { secret: 'not public' };
  }

  @Get('missing-permission')
  @UseGuards(AccessGuard)
  missingPermission() {
    return { secret: 'not public' };
  }

  @Get('permission-without-guard')
  @RequirePermissions('sales.read')
  missingGuard() {
    return { secret: 'not public' };
  }

  @Get('unknown-permission')
  @UseGuards(AccessGuard)
  @RequirePermissions('nonexistent.permission')
  unknownPermission() {
    return { secret: 'not public' };
  }

  @Get('protected')
  @UseGuards(AccessGuard)
  @RequirePermissions('sales.read')
  protectedRoute() {
    return { ok: true };
  }

  @Get('identity')
  @UseGuards(AccessGuard)
  @AuthenticatedOnly()
  identity() {
    return { ok: true };
  }

  @Get('public')
  @PublicRoute()
  publicRoute() {
    return { ok: true };
  }
}

describe('Politique globale des routes HTTP', () => {
  let app: INestApplication;
  const user = { id: 'user', status: 'ACTIVE', tokenVersion: 1, permissions: ['sales.read'] };
  const users = { findById: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PolicyTestController],
      providers: [
        Reflector,
        AccessGuard,
        { provide: APP_GUARD, useClass: RoutePolicyGuard },
        {
          provide: TOKEN_SERVICE,
          useValue: { verifyAccess: async () => ({ sub: 'user', ver: 1, sid: 'session' }) },
        },
        { provide: USER_REPOSITORY, useValue: users },
        {
          provide: SESSION_REPOSITORY,
          useValue: {
            findById: async () => ({
              userId: 'user',
              revokedAt: null,
              expiresAt: new Date(Date.now() + 60000),
            }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => users.findById.mockResolvedValue(user));

  it.each(['forgotten', 'missing-permission', 'permission-without-guard', 'unknown-permission'])(
    'bloque une route mal configurée : %s',
    async (path) => {
      await request(app.getHttpServer())
        .get('/policy-test/' + path)
        .expect(403);
      await request(app.getHttpServer())
        .get('/policy-test/' + path)
        .set('Authorization', 'Bearer valid')
        .expect(403);
    },
  );
  it('conserve la vérification réelle du garde d’accès', async () => {
    await request(app.getHttpServer()).get('/policy-test/protected').expect(401);
    await request(app.getHttpServer())
      .get('/policy-test/protected')
      .set('Authorization', 'Bearer valid')
      .expect(200);
    users.findById.mockResolvedValue({ ...user, permissions: [] });
    await request(app.getHttpServer())
      .get('/policy-test/protected')
      .set('Authorization', 'Bearer valid')
      .expect(403);
    await request(app.getHttpServer())
      .get('/policy-test/identity')
      .set('Authorization', 'Bearer valid')
      .expect(200);
    await request(app.getHttpServer()).get('/policy-test/identity').expect(401);
    await request(app.getHttpServer()).get('/policy-test/public').expect(200);
  });

  it('refuse une route qui se déclare à la fois publique et réservée', () => {
    const handler = () => undefined;
    const controller = class {};
    Reflect.defineMetadata('dsolar.public_route', true, handler);
    Reflect.defineMetadata('dsolar.authenticated_only', true, handler);
    const context = { getHandler: () => handler, getClass: () => controller } as unknown as ExecutionContext;
    expect(() => new RoutePolicyGuard(new Reflector()).canActivate(context)).toThrow();
  });
});
