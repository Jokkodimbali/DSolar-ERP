/**
 * Refuse to connect integration fixtures to any non-disposable database.
 * Validate both URLs: Prisma uses DATABASE_URL for runtime operations.
 */
export function assertLocalIntegrationDatabase(env: NodeJS.ProcessEnv): void {
  const message = 'Les tests exigent NODE_ENV=test et une base PostgreSQL locale dsolar_test.';
  if (env.NODE_ENV !== 'test') throw new Error(message);

  for (const value of [env.DATABASE_URL, env.DIRECT_URL]) {
    let url: URL;
    try {
      url = new URL(value ?? '');
    } catch {
      throw new Error(message);
    }
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/dsolar_test' ||
      [...url.searchParams.keys()].some((key) => !['schema', 'sslmode'].includes(key))
    ) {
      throw new Error(message);
    }
  }
}
