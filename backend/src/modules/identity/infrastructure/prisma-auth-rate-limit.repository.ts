import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuthRateLimit } from '../application/auth-rate-limit.port';

@Injectable()
export class PrismaAuthRateLimitRepository implements AuthRateLimit {
  private readonly logger = new Logger(PrismaAuthRateLimitRepository.name);
  private nextCleanup = 0;

  constructor(private readonly prisma: PrismaService) {}

  async consume(key: string, limit: number): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/.test(key) || !Number.isInteger(limit) || limit < 1 || limit > 120)
      throw new Error('Paramètres de limitation invalides.');
    // One atomic UPSERT; the database clock and row lock are shared by all instances.
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "AuthRateLimitBucket" ("key", "count", "expiresAt")
      VALUES (${key}, 1, timezone('UTC', now()) + interval '15 minutes')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "AuthRateLimitBucket"."expiresAt" <= timezone('UTC', now())
          THEN 1 ELSE "AuthRateLimitBucket"."count" + 1 END,
        "expiresAt" = CASE WHEN "AuthRateLimitBucket"."expiresAt" <= timezone('UTC', now())
          THEN timezone('UTC', now()) + interval '15 minutes' ELSE "AuthRateLimitBucket"."expiresAt" END
      WHERE "AuthRateLimitBucket"."expiresAt" <= timezone('UTC', now())
        OR "AuthRateLimitBucket"."count" < ${limit}
      RETURNING "count"
    `;
    const now = Date.now();
    if (now >= this.nextCleanup) {
      this.nextCleanup = now + 60000;
      try {
        await this.prisma.$executeRaw`
          DELETE FROM "AuthRateLimitBucket" WHERE "key" IN (
            SELECT "key" FROM "AuthRateLimitBucket" WHERE "expiresAt" <= timezone('UTC', now())
            ORDER BY "expiresAt" LIMIT 5000 FOR UPDATE SKIP LOCKED
          )
        `;
      } catch {
        this.logger.warn('Nettoyage des compteurs expirés reporté.');
      }
    }
    return rows.length === 1;
  }
}
