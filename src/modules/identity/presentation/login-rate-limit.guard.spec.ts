import { ExecutionContext, HttpException } from '@nestjs/common';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

describe('LoginRateLimitGuard', () => {
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '192.0.2.42',
        body: { email: 'test@example.com' },
      }),
    }),
  } as unknown as ExecutionContext;

  it('tracks different email accounts separately', () => {
    const guard = new LoginRateLimitGuard();
    for (let i = 0; i < 10; i += 1) expect(guard.canActivate(context)).toBe(true);
    const otherContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '192.0.2.42',
          body: { email: 'other@example.com' },
        }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(otherContext)).toBe(true);
  });

  it('limite une adresse IP même si les adresses e-mail changent', () => {
    const guard = new LoginRateLimitGuard();
    const attempt = (i: number) => ({ switchToHttp: () => ({ getRequest: () => ({
      ip: '192.0.2.42', body: { email: 'account-' + i + '@example.test' },
    }) }) }) as unknown as ExecutionContext;
    for (let i = 0; i < 60; i++) expect(guard.canActivate(attempt(i))).toBe(true);
    expect(() => guard.canActivate(attempt(60))).toThrow(HttpException);
  });

  it('rejects excessive attempts with HTTP 429', () => {
    const guard = new LoginRateLimitGuard();
    for (let i = 0; i < 10; i += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    try {
      guard.canActivate(context);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });
});
