import { JwtService } from '@nestjs/jwt';
import { JwtTokenService } from './crypto-services';

describe('JwtTokenService', () => {
  const previousAccessSecret = process.env.JWT_ACCESS_SECRET;
  const previousRefreshSecret = process.env.JWT_REFRESH_SECRET;
  const service = new JwtTokenService(new JwtService());

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-with-at-least-32-chars';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-with-at-least-32-chars';
  });

  afterAll(() => {
    if (previousAccessSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousAccessSecret;
    if (previousRefreshSecret === undefined) delete process.env.JWT_REFRESH_SECRET;
    else process.env.JWT_REFRESH_SECRET = previousRefreshSecret;
  });

  it('lie le JWT d’accès à sa session et refuse les anciens jetons sans sid', async () => {
    const claims = { sub: 'user-id', sid: 'session-id', ver: 0, typ: 'access' as const };
    await expect(service.verifyAccess(await service.signAccess(claims))).resolves.toMatchObject(claims);
    const old = await new JwtService().signAsync(
      { sub: 'user-id', ver: 0, typ: 'access' },
      { secret: process.env.JWT_ACCESS_SECRET, algorithm: 'HS256', expiresIn: '15m' },
    );
    await expect(service.verifyAccess(old)).rejects.toThrow();
  });

  it('signe et valide un refresh token contenant un jti', async () => {
    const token = await service.signRefresh({
      sub: 'user-id',
      sid: 'session-id',
      typ: 'refresh',
      jti: 'unique-token-id',
    });

    await expect(service.verifyRefresh(token)).resolves.toMatchObject({
      sub: 'user-id',
      sid: 'session-id',
      typ: 'refresh',
      jti: 'unique-token-id',
    });
  });

  it('génère un jti différent si le caller ne le fournit pas', async () => {
    const claims = { sub: 'user-id', sid: 'session-id', typ: 'refresh' as const };
    const first = await service.verifyRefresh(await service.signRefresh(claims));
    const second = await service.verifyRefresh(await service.signRefresh(claims));

    expect(first.jti).toBeTruthy();
    expect(second.jti).toBeTruthy();
    expect(second.jti).not.toBe(first.jti);
  });
});
