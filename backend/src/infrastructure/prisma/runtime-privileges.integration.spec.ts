import { PrismaService } from './prisma.service';
import { inspectRuntimePrivileges } from './runtime-privileges';

const integration = process.env.RUNTIME_ROLE_INTEGRATION === '1' ? describe : describe.skip;
integration('Contrôle des privilèges au démarrage', () => {
  it('refuse le propriétaire ou les droits excessifs et accepte le rôle restreint', async () => {
    const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map(
      (value) => new URL(value || 'invalid:'),
    );
    if (
      process.env.NODE_ENV !== 'test' ||
      urls.some(
        (url) =>
          !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
          url.pathname !== '/dsolar_test' ||
          !['dsolar_test', 'dsolar_runtime_test'].includes(url.username),
      )
    )
      throw new Error('Base CI locale requise.');
    const prisma = new PrismaService();
    const previous = process.env.DB_REQUIRE_RESTRICTED_ROLE;
    process.env.DB_REQUIRE_RESTRICTED_ROLE = 'true';
    try {
      const report = await inspectRuntimePrivileges(prisma);
      if (process.env.RUNTIME_ROLE_EXPECT_SAFE === 'true') {
        expect(report).toEqual({ safe: true, checks: [] });
        await expect(prisma.onModuleInit()).resolves.toBeUndefined();
      } else {
        expect(report.safe).toBe(false);
        expect(report.checks).toContain(process.env.RUNTIME_ROLE_EXPECT_CHECK);
        await expect(prisma.onModuleInit()).rejects.toThrow('Privilèges PostgreSQL incompatibles');
      }
    } finally {
      if (previous === undefined) delete process.env.DB_REQUIRE_RESTRICTED_ROLE;
      else process.env.DB_REQUIRE_RESTRICTED_ROLE = previous;
      await prisma.$disconnect();
    }
  }, 30000);
});
