import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

describe('LoginRateLimitGuard', () => {
  const context = (email: string, handler = 'login') =>
    ({
      getHandler: () => ({ name: handler }),
      switchToHttp: () => ({ getRequest: () => ({ ip: '192.0.2.42', body: { email } }) }),
    }) as unknown as ExecutionContext;

  function setup() {
    const counts = new Map<string, number>();
    const limiter = {
      consume: jest.fn(async (key: string, limit: number) => {
        const count = counts.get(key) ?? 0;
        if (count >= limit) return false;
        counts.set(key, count + 1);
        return true;
      }),
    };
    return { limiter, guard: new LoginRateLimitGuard(limiter) };
  }

  it('partage les quotas entre instances', async () => {
    const { guard, limiter } = setup();
    const second = new LoginRateLimitGuard(limiter);
    for (let i = 0; i < 10; i++)
      await expect(guard.canActivate(context('test@example.com'))).resolves.toBe(true);
    await expect(second.canActivate(context('test@example.com'))).rejects.toMatchObject({ status: 429 });
    await expect(second.canActivate(context('other@example.com'))).resolves.toBe(true);
    expect(limiter.consume.mock.calls.every(([key]) => /^[a-f0-9]{64}$/.test(key))).toBe(true);
  });

  it('limite une IP même si les adresses e-mail changent', async () => {
    const { guard } = setup();
    for (let i = 0; i < 60; i++) await guard.canActivate(context('account-' + i + '@example.test'));
    await expect(guard.canActivate(context('other@example.com'))).rejects.toMatchObject({ status: 429 });
  });

  it('refuse le renouvellement si le stockage partagé est indisponible', async () => {
    const { guard, limiter } = setup();
    limiter.consume.mockRejectedValue(new Error('Database unavailable'));
    await expect(guard.canActivate(context('', 'refresh'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
