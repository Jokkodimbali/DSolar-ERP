import { randomBytes } from 'node:crypto';
import { assertLocalIntegrationDatabase } from '../../../infrastructure/prisma/local-integration-database';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaAuthRateLimitRepository } from './prisma-auth-rate-limit.repository';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;
integration('Limitation distribuée PostgreSQL', () => {
  it('respecte exactement le quota concurrent et réinitialise un compteur expiré', async () => {
    assertLocalIntegrationDatabase(process.env);
    const prisma = new PrismaService();
    const another = new PrismaService();
    const key = randomBytes(32).toString('hex');
    try {
      const first = new PrismaAuthRateLimitRepository(prisma);
      const second = new PrismaAuthRateLimitRepository(another);
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => (i % 2 ? first : second).consume(key, 10)),
      );
      expect(results.filter(Boolean)).toHaveLength(10);
      expect((await prisma.authRateLimitBucket.findUniqueOrThrow({ where: { key } })).count).toBe(10);
      await prisma.authRateLimitBucket.update({ where: { key }, data: { expiresAt: new Date(0) } });
      expect(await second.consume(key, 10)).toBe(true);
      expect((await prisma.authRateLimitBucket.findUniqueOrThrow({ where: { key } })).count).toBe(1);
    } finally {
      await prisma.authRateLimitBucket.deleteMany({ where: { key } });
      await prisma.$disconnect();
      await another.$disconnect();
    }
  }, 30000);
});
