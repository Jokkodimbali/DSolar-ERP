import { validatedJwtSecrets } from './jwt-configuration';

describe('Configuration JWT', () => {
  const env = {
    JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-32-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-with-at-least-32-chars',
  };

  it('accepte deux secrets distincts correctement configurés', () => {
    expect(validatedJwtSecrets(env)).toEqual(env);
  });

  it.each([
    undefined,
    '',
    'court',
    'REMPLACER_PAR_SECRET_ALEATOIRE_DE_PLUS_DE_32_CARACTERES',
    'REMPLACER_PAR_UN_AUTRE_SECRET_ALEATOIRE_DE_PLUS_DE_32_CARACTERES',
    ' test-access-secret-with-at-least-32-chars',
  ])('refuse un secret absent, court ou non configuré', (value) => {
    expect(() => validatedJwtSecrets({ ...env, JWT_ACCESS_SECRET: value })).toThrow();
    expect(() => validatedJwtSecrets({ ...env, JWT_REFRESH_SECRET: value })).toThrow();
  });

  it('refuse des secrets identiques', () => {
    expect(() =>
      validatedJwtSecrets({ ...env, JWT_REFRESH_SECRET: env.JWT_ACCESS_SECRET }),
    ).toThrow();
  });

  it('ne divulgue pas le secret dans le message d’erreur', () => {
    const secret = 'REMPLACER_PAR_SECRET_ALEATOIRE_DE_PLUS_DE_32_CARACTERES';
    expect(() => validatedJwtSecrets({ ...env, JWT_ACCESS_SECRET: secret })).not.toThrow(secret);
    expect(() => validatedJwtSecrets({ ...env, JWT_ACCESS_SECRET: secret })).toThrow();
  });
});
