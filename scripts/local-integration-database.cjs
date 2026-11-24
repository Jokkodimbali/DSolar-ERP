// Keep this policy aligned with src/infrastructure/prisma/local-integration-database.ts.
function assertLocalIntegrationDatabase(env) {
  const message = 'Integration tests require NODE_ENV=test and local database dsolar_test.';
  if (env.NODE_ENV !== 'test') throw new Error(message);
  for (const value of [env.DATABASE_URL, env.DIRECT_URL]) {
    let url;
    try {
      url = new URL(value || '');
    } catch {
      throw new Error(message);
    }
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/dsolar_test' ||
      [...url.searchParams.keys()].some((key) => !['schema', 'sslmode'].includes(key)) ||
      url.searchParams.getAll('schema').length > 1 ||
      url.searchParams.getAll('sslmode').length > 1 ||
      (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')
    ) {
      throw new Error(message);
    }
  }
}
module.exports = { assertLocalIntegrationDatabase };
