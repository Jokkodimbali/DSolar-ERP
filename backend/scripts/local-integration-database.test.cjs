const assert = require('node:assert/strict');
const { test } = require('node:test');
const { assertLocalIntegrationDatabase } = require('./local-integration-database.cjs');
const local = 'postgresql://test:test@localhost:5432/dsolar_test?schema=public';
const env = { NODE_ENV: 'test', DATABASE_URL: local, DIRECT_URL: local };
test('accepts disposable local URLs', () => {
  assert.doesNotThrow(() => assertLocalIntegrationDatabase(env));
});
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  for (const value of [
    undefined, 'secret-invalid-url', 'postgresql://remote.example/dsolar_test',
    'postgresql://localhost/production', 'postgresql://localhost/dsolar_test?host=remote.example',
    'postgresql://localhost/dsolar_test?schema=private',
    'postgresql://localhost/dsolar_test?schema=public&schema=private',
    'postgresql://localhost/dsolar_test?sslmode=require&sslmode=disable',
  ]) {
    test('rejects unsafe ' + key + ' case ' + String(value), () => {
      assert.throws(() => assertLocalIntegrationDatabase({ ...env, [key]: value }), {
        message: 'Integration tests require NODE_ENV=test and local database dsolar_test.',
      });
    });
  }
}
test('rejects non-test environment', () => {
  assert.throws(() => assertLocalIntegrationDatabase({ ...env, NODE_ENV: 'production' }));
});
