import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaAuthRateLimitRepository } from './prisma-auth-rate-limit.repository';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;
integration('Limitation distribuée PostgreSQL', () => {
  it('respecte exactement le quota concurrent et réinitialise un compteur expiré', async () => {
    const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map(
      (value) => new URL(value || 'invalid:'),
    );
    if (
      process.env.NODE_ENV !== 'test' ||
      urls.some(
        (url) =>
          !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
          url.pathname !== '/dsolar_test' ||
          !['postgres:', 'postgresql:'].includes(url.protocol),
      )
    )
      throw new Error('Base locale de test requise.');
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
