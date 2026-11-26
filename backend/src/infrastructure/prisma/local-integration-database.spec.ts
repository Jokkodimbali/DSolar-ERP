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
    'postgresql://localhost/dsolar_test?schema=private',
    'postgresql://localhost/dsolar_test?schema=public&schema=private',
    'postgresql://localhost/dsolar_test?sslmode=require&sslmode=disable',
    'postgresql://localhost/dsolar_test?options=-csearch_path%3Dprivate',
  ])('refuse une URL non autorisée : %s', (value) => {
    expect(() => assertLocalIntegrationDatabase({ ...env, DATABASE_URL: value })).toThrow();
    expect(() => assertLocalIntegrationDatabase({ ...env, DIRECT_URL: value })).toThrow();
  });

  it('masque les identifiants de connexion en cas d’URL invalide', () => {
    const secret = 'secret-ne-pas-exposer';
    try {
      assertLocalIntegrationDatabase({ ...env, DATABASE_URL: secret });
      throw new Error('La validation aurait dû échouer.');
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(error).not.toHaveProperty('input');
      expect(String(error)).toContain('dsolar_test');
    }
  });

  it('refuse une exécution hors environnement de test', () => {
    expect(() => assertLocalIntegrationDatabase({ ...env, NODE_ENV: 'production' })).toThrow();
  });
});
