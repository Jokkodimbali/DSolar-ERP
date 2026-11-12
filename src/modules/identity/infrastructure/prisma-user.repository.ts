import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { IdentityUser } from '../domain/identity.types';
import { UserRepository } from '../application/ports';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}
  findByEmail(email: string): Promise<IdentityUser | null> {
    return this.load({ email });
  }
  findById(id: string): Promise<IdentityUser | null> {
    return this.load({ id });
  }
  private async load(where: { id?: string; email?: string }): Promise<IdentityUser | null> {
    const u = await this.prisma.user.findFirst({
      where,
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        stores: true,
      },
    });
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      passwordHash: u.passwordHash,
      status: u.status,
      tokenVersion: u.tokenVersion,
      permissions: [...new Set(u.roles.flatMap((x) => x.role.permissions.map((y) => y.permission.code)))],
      storeIds: u.stores.map((x) => x.storeId),
    };
  }
}
