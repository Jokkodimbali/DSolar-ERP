import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { BootstrapRepository } from '../application/bootstrap.port';
@Injectable()
export class PrismaBootstrapRepository implements BootstrapRepository {
  constructor(private readonly prisma: PrismaService) {}
  async initialize(
    email: string,
    fullName: string,
    passwordHash: string,
  ): Promise<'created' | 'already_initialized'> {
    return this.prisma.$transaction(
      async (tx) => {
        // Verrou transactionnel partagé par toutes les initialisations concurrentes.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(72816421)`;
        if ((await tx.user.count()) > 0) return 'already_initialized';
        const permissionCodes = [
          'users.manage',
          'stores.read',
          'stores.manage',
          'products.read',
          'products.manage',
          'inventory.read',
          'inventory.manage',
        ];
        await tx.permission.createMany({
          data: permissionCodes.map((code) => ({ code, description: code })),
          skipDuplicates: true,
        });
        const role = await tx.role.upsert({
          where: { code: 'ADMIN' },
          create: { code: 'ADMIN', name: 'Administrateur' },
          update: {},
        });
        const permissions = await tx.permission.findMany({
          where: { code: { in: permissionCodes } },
          select: { id: true },
        });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
          skipDuplicates: true,
        });
        await tx.user.create({
          data: { email, fullName, passwordHash, roles: { create: [{ roleId: role.id }] } },
        });
        return 'created';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
    );
  }
}
