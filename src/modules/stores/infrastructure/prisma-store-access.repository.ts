import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { StoreAccessRepository } from '../application/store-access.repository';
@Injectable()
export class PrismaStoreAccessRepository implements StoreAccessRepository {
  constructor(private readonly prisma: PrismaService) {}
  async userExists(userId: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id: userId, status: 'ACTIVE' } })) > 0;
  }
  async hasAccess(userId: string, storeId: string): Promise<boolean> {
    return (await this.prisma.userStoreAccess.count({ where: { userId, storeId } })) > 0;
  }
  async grant(userId: string, storeId: string): Promise<void> {
    await this.prisma.userStoreAccess.upsert({ where: { userId_storeId: { userId, storeId } }, create: { userId, storeId }, update: {} });
  }
  async revoke(userId: string, storeId: string): Promise<void> {
    await this.prisma.userStoreAccess.deleteMany({ where: { userId, storeId } });
  }
  async listStoreIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userStoreAccess.findMany({ where: { userId: userId }, select: { storeId: true } });
    return rows.map(row => row.storeId);
  }
}
