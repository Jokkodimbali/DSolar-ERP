import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessGuard, REQUIRED_PERMISSIONS } from './access.guard';
import { TokenService, UserRepository } from '../application/ports';

describe('AccessGuard', () => {
  const reflector = new Reflector();
  const tokens = { verifyAccess: jest.fn() };
  const users = { findById: jest.fn() };
  const guard = new AccessGuard(
    reflector,
    tokens as unknown as TokenService,
    users as unknown as UserRepository,
  );
  const request = { headers: { authorization: 'Bearer valid-token' }, identity: undefined as unknown };
  const handler = () => undefined;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    request.headers.authorization = 'Bearer valid-token';
    tokens.verifyAccess.mockResolvedValue({ sub: 'user-1', ver: 2 });
    users.findById.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      tokenVersion: 2,
      permissions: ['sales.read'],
    });
    Reflect.defineMetadata(REQUIRED_PERMISSIONS, ['sales.read'], handler);
  });

  it('accepte un utilisateur actif avec la permission requise', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.identity).toEqual({ id: 'user-1' });
  });

  it('refuse une permission manquante', async () => {
    Reflect.defineMetadata(REQUIRED_PERMISSIONS, ['sales.manage'], handler);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('refuse une session révoquée', async () => {
    users.findById.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      tokenVersion: 3,
      permissions: ['sales.read'],
    });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('refuse un utilisateur désactivé', async () => {
    users.findById.mockResolvedValue({
      id: 'user-1',
      status: 'INACTIVE',
      tokenVersion: 2,
      permissions: ['sales.read'],
    });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it.each(['Bearer ', 'Bearer one two', 'Basic abc', 'Bearer one\\ntwo'])(
    'refuse un en-tête Authorization malformé : %s',
    async (header) => {
      request.headers.authorization = header;
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(tokens.verifyAccess).not.toHaveBeenCalled();
    },
  );
});
