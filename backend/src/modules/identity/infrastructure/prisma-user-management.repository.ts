import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PublicIdentity } from '../domain/identity.types';
import { CreateUserRecord, UserManagementRepository, ManagedUser } from '../application/user-management.port';
import { PrismaUserRepository } from './prisma-user.repository';
@Injectable()
export class PrismaUserManagementRepository implements UserManagementRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: PrismaUserRepository,
  ) {}
  async list(): Promise<ManagedUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        roles: {
          select: {
            role: {
              select: { code: true, permissions: { select: { permission: { select: { code: true } } } } },
            },
          },
        },
        stores: { select: { storeId: true } },
      },
    });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      nomComplet: user.fullName,
      status: user.status,
      roleCodes: user.roles.map((entry) => entry.role.code).sort(),
      permissions: [
        ...new Set(
          user.roles
            .filter((entry) => ['ADMIN', 'MAGASINIER'].includes(entry.role.code))
            .flatMap((entry) => entry.role.permissions.map((permission) => permission.permission.code)),
        ),
      ].sort(),
      magasinsAutorises: user.stores.map((entry) => entry.storeId).sort(),
    }));
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
  async create(input: CreateUserRecord, actorId?: string): Promise<PublicIdentity> {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email,
            fullName: input.fullName,
            passwordHash: input.passwordHash,
            roles: { create: input.roleCodes.map((code) => ({ role: { connect: { code } } })) },
            stores: { create: input.storeIds.map((storeId) => ({ store: { connect: { id: storeId } } })) },
          },
        });
        if (actorId)
          await tx.auditLog.create({
            data: {
              actorId,
              action: 'USER_CREATED',
              entityType: 'User',
              entityId: created.id,
              payload: { roleCodes: input.roleCodes, storeIds: input.storeIds },
            },
          });
        return created;
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
  async disableUnlessLastAdmin(
    id: string,
    actorId?: string,
  ): Promise<'disabled' | 'not_found' | 'last_admin'> {
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
        if (user.status === 'DISABLED') return 'disabled';
        await tx.user.update({
          where: { id },
          data: {
            status: 'DISABLED',
            tokenVersion: { increment: 1 },
            sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } },
          },
        });
        if (actorId)
          await tx.auditLog.create({
            data: {
              actorId,
              action: 'USER_DISABLED',
              entityType: 'User',
              entityId: id,
              payload: { previousStatus: user.status, newStatus: 'DISABLED' },
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
    actorId?: string,
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
        const previousRoles = user.roles.map((r) => r.role.code).sort();
        const previousStores = (
          await tx.userStoreAccess.findMany({ where: { userId: id }, select: { storeId: true } })
        )
          .map((row) => row.storeId)
          .sort();
        const changed =
          JSON.stringify(previousRoles) !== JSON.stringify([...roleCodes].sort()) ||
          JSON.stringify(previousStores) !== JSON.stringify([...storeIds].sort());
        if (!changed) return 'updated';
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
        if (actorId)
          await tx.auditLog.create({
            data: {
              actorId,
              action: 'USER_ACCESS_CHANGED',
              entityType: 'User',
              entityId: id,
              payload: {
                previousRoles,
                newRoles: roleCodes,
                previousStoreIds: previousStores,
                newStoreIds: storeIds,
              },
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
