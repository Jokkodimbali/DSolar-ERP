import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { StoreRepository } from '../application/store.repository';
import { NewStore, Store } from '../domain/store';
@Injectable()
export class PrismaStoreRepository implements StoreRepository {
  constructor(private readonly prisma: PrismaService) {}
  findAll(): Promise<Store[]> {
    return this.prisma.store.findMany({ orderBy: { name: 'asc' } });
  }
  findById(id: string): Promise<Store | null> {
    return this.prisma.store.findUnique({ where: { id } });
  }
  findByCode(code: string): Promise<Store | null> {
    return this.prisma.store.findUnique({ where: { code } });
  }
  async create(input: NewStore, actorId?: string): Promise<Store> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.create({ data: input });
        if (actorId) await tx.auditLog.create({ data: {
          actorId, action: 'STORE_CREATED', entityType: 'Store', entityId: store.id, storeId: store.id,
          payload: { code: store.code, name: store.name },
        } });
        return store;
      });
    } catch (error: unknown) {
      this.handle(error);
      throw error;
    }
  }
  async update(id: string, input: { name?: string; address?: string | null }, actorId?: string): Promise<Store> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.store.findUnique({ where: { id } });
        if (!before) throw new NotFoundException('Magasin introuvable.');
        const store = await tx.store.update({ where: { id }, data: input });
        if (actorId && (before.name !== store.name || before.address !== store.address))
          await tx.auditLog.create({ data: {
            actorId, action: 'STORE_UPDATED', entityType: 'Store', entityId: id, storeId: id,
            payload: { changedFields: [
              ...(before.name !== store.name ? ['name'] : []),
              ...(before.address !== store.address ? ['address'] : []),
            ] },
          } });
        return store;
      });
    } catch (error: unknown) {
      this.handle(error);
      throw error;
    }
  }
  async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actorId?: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Sérialise les changements de statut concurrents sur un même magasin.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
          const store = await tx.store.findUnique({ where: { id } });
          if (!store) throw new NotFoundException('Magasin introuvable.');
          if (store.status === status) return store;
          if (status === 'INACTIVE') {
            const [stocks, pendingTransfers] = await Promise.all([
              tx.storeStock.count({
                where: {
                  storeId: id,
                  OR: [{ quantity: { gt: 0 } }, { reserved: { gt: 0 } }],
                },
              }),
              tx.stockTransfer.count({
                where: {
                  OR: [{ originId: id }, { destinationId: id }],
                  status: { in: ['DRAFT', 'APPROVED', 'SHIPPED'] },
                },
              }),
            ]);
            if (stocks > 0)
              throw new ConflictException(
                'Impossible de désactiver un magasin contenant du stock ou des réservations.',
              );
            if (pendingTransfers > 0)
              throw new ConflictException(
                'Impossible de désactiver un magasin avec des transferts en cours.',
              );
          }
          const updated = await tx.store.update({ where: { id }, data: { status } });
          if (actorId) await tx.auditLog.create({ data: {
            actorId, action: status === 'ACTIVE' ? 'STORE_ACTIVATED' : 'STORE_DEACTIVATED',
            entityType: 'Store', entityId: id, storeId: id,
            payload: { previousStatus: store.status, newStatus: status },
          } });
          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
      );
    } catch (error: unknown) {
      this.handle(error);
      throw error;
    }
  }
  private handle(error: unknown): void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return;
    if (error.code === 'P2002') throw new ConflictException('Ce code magasin existe déjà.');
    if (error.code === 'P2025') throw new NotFoundException('Magasin introuvable.');
  }
}
