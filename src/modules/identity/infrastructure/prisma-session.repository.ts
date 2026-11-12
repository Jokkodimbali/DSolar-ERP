import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SessionRepository } from '../application/ports';
import { SessionRecord } from '../domain/identity.types';

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}
  create(userId: string, tokenHash: string, expiresAt: Date): Promise<SessionRecord> {
    return this.prisma.refreshSession.create({ data: { userId, tokenHash, expiresAt } });
  }
  findById(id: string): Promise<SessionRecord | null> {
    return this.prisma.refreshSession.findUnique({ where: { id } });
  }
  async rotate(id: string, expectedHash: string, newHash: string, expiresAt: Date): Promise<boolean> {
    const result = await this.prisma.refreshSession.updateMany({
      where: { id, tokenHash: expectedHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { tokenHash: newHash, expiresAt },
    });
    return result.count === 1;
  }
  async revoke(id: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({ where: { id }, data: { revokedAt: new Date() } });
  }
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
