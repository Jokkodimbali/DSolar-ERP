import { assertLocalIntegrationDatabase } from './local-integration-database';

describe('Isolation de la base de tests', () => {
  const local = 'postgresql://test:test@localhost:5432/dsolar_test?schema=public';
  const env = { NODE_ENV: 'test', DATABASE_URL: local, DIRECT_URL: local };

  it('autorise les deux connexions PostgreSQL locales de test', () => {
    expect(() => assertLocalIntegrationDatabase(env)).not.toThrow();
  });

  it.each(['DATABASE_URL', 'DIRECT_URL'])('refuse une URL distante dans %s', (key) => {
    expect(() =>
      assertLocalIntegrationDatabase({
        ...env,
        [key]: 'postgresql://test:test@remote.example/dsolar_test',
      }),
    ).toThrow();
  });

  it.each([
    undefined,
    'invalid',
    'https://localhost/dsolar_test',
    'postgresql://localhost/production',
    'postgresql://localhost/dsolar_test?host=remote.example',
  ])('refuse une URL non autorisée : %s', (value) => {
    expect(() => assertLocalIntegrationDatabase({ ...env, DATABASE_URL: value })).toThrow();
    expect(() => assertLocalIntegrationDatabase({ ...env, DIRECT_URL: value })).toThrow();
  });

  it('refuse une exécution hors environnement de test', () => {
    expect(() => assertLocalIntegrationDatabase({ ...env, NODE_ENV: 'production' })).toThrow();
  });
});
