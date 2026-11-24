import { validSessionClaims } from './session-claims';

describe('Contrat JWT de session', () => {
  const now = 1000000;
  const access = { typ: 'access', sub: 'user', sid: 'session', ver: 0, iat: now, exp: now + 900 };
  const refresh = { typ: 'refresh', sub: 'user', sid: 'session', jti: 'token', iat: now, exp: now + 604800 };

  it('accepte les claims émis conformément au contrat', () => {
    expect(validSessionClaims(access, 'access', now)).toBe(true);
    expect(validSessionClaims(refresh, 'refresh', now)).toBe(true);
  });

  it.each([
    { exp: undefined },
    { iat: undefined },
    { exp: now },
    { exp: now + 901 },
    { iat: now + 1 },
    { sid: 123 },
    { sub: ['user'] },
    { sub: ' ' },
    { ver: -1 },
    { ver: Number.MAX_SAFE_INTEGER + 1 },
    { typ: 'refresh' },
  ])('refuse un claim accès invalide : %j', (patch) => {
    expect(validSessionClaims({ ...access, ...patch }, 'access', now)).toBe(false);
  });

  it.each([undefined, '', 42, ' '])('refuse un jti invalide : %s', (jti) => {
    expect(validSessionClaims({ ...refresh, jti }, 'refresh', now)).toBe(false);
  });
});
