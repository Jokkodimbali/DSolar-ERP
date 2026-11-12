import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PublicIdentity } from '../domain/identity.types';
import { CreateUserRecord, UserManagementRepository } from '../application/user-management.port';
import { PrismaUserRepository } from './prisma-user.repository';
@Injectable()
export class PrismaUserManagementRepository implements UserManagementRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: PrismaUserRepository,
  ) {}
  async list(): Promise<PublicIdentity[]> {
    const users = await this.prisma.user.findMany({ select: { id: true }, orderBy: { createdAt: 'desc' } });
    const result = await Promise.all(users.map((u) => this.identity.findById(u.id)));
    return result.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => this.publicUser(u));
  }
  async emailExists(email: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { email } })) > 0;
  }
  async rolesExist(codes: string[]): Promise<boolean> {
    return (await this.prisma.role.count({ where: { code: { in: codes } } })) === codes.length;
  }
  async activeStoresExist(ids: string[]): Promise<boolean> {
    return (await this.prisma.store.count({ where: { id: { in: ids }, status: 'ACTIVE' } })) === ids.length;
  }
  async create(input: CreateUserRecord): Promise<PublicIdentity> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash: input.passwordHash,
          roles: { create: input.roleCodes.map((code) => ({ role: { connect: { code } } })) },
          stores: { create: input.storeIds.map((storeId) => ({ store: { connect: { id: storeId } } })) },
        },
      });
      const identity = await this.identity.findById(user.id);
      if (!identity) throw new Error('Utilisateur créé mais introuvable.');
      return this.publicUser(identity);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Cette adresse e-mail est déjà utilisée.');
      throw error;
    }
  }
  // Le contrôle et la modification sont atomiques : aucune fenêtre de concurrence
  // ne peut laisser l'application sans administrateur actif.
  async disableUnlessLastAdmin(id: string): Promise<'disabled' | 'not_found' | 'last_admin'> {
    return this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id },
          include: { roles: { include: { role: true } } },
        });
        if (!user) return 'not_found';
        if (user.status === 'ACTIVE' && user.roles.some((r) => r.role.code === 'ADMIN')) {
          const admins = await tx.user.count({
            where: { status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
          });
          if (admins <= 1) return 'last_admin';
        }
        await tx.user.update({
          where: { id },
          data: {
            status: 'DISABLED',
            tokenVersion: { increment: 1 },
            sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } },
          },
        });
        return 'disabled';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async replaceAccessUnlessLastAdmin(
    id: string,
    roleCodes: string[],
    storeIds: string[],
  ): Promise<PublicIdentity | 'last_admin' | null> {
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id },
          include: { roles: { include: { role: true } } },
        });
        if (!user) return 'not_found';
        if (
          user.status === 'ACTIVE' &&
          user.roles.some((r) => r.role.code === 'ADMIN') &&
          !roleCodes.includes('ADMIN')
        ) {
          const admins = await tx.user.count({
            where: { status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
          });
          if (admins <= 1) return 'last_admin';
        }
        const roles = await tx.role.findMany({ where: { code: { in: roleCodes } }, select: { id: true } });
        if (roles.length !== roleCodes.length)
          throw new ConflictException('Les rôles ont changé pendant la modification.');
        const stores = await tx.store.count({ where: { id: { in: storeIds }, status: 'ACTIVE' } });
        if (stores !== storeIds.length)
          throw new ConflictException('Les magasins ont changé pendant la modification.');
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userStoreAccess.deleteMany({ where: { userId: id } });
        if (roles.length)
          await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });
        if (storeIds.length)
          await tx.userStoreAccess.createMany({ data: storeIds.map((storeId) => ({ userId: id, storeId })) });
        await tx.user.update({
          where: { id },
          data: {
            tokenVersion: { increment: 1 },
            sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } },
          },
        });
        return 'updated';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (outcome === 'not_found') return null;
    if (outcome === 'last_admin') return 'last_admin';
    const user = await this.identity.findById(id);
    return user ? this.publicUser(user) : null;
  }
  private publicUser(u: {
    id: string;
    email: string;
    fullName: string;
    permissions: string[];
    storeIds: string[];
  }): PublicIdentity {
    return {
      id: u.id,
      email: u.email,
      nomComplet: u.fullName,
      permissions: u.permissions,
      magasinsAutorises: u.storeIds,
    };
  }
}
