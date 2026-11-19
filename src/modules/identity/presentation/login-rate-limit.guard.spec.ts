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
