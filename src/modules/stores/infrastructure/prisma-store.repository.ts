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
  async create(input: NewStore): Promise<Store> {
    try {
      return await this.prisma.store.create({ data: input });
    } catch (error: unknown) {
      this.handle(error);
      throw error;
    }
  }
  async update(id: string, input: { name?: string; address?: string | null }): Promise<Store> {
    try {
      return await this.prisma.store.update({ where: { id }, data: input });
    } catch (error: unknown) {
      this.handle(error);
      throw error;
    }
  }
  async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<Store> {
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
              throw new ConflictException('Impossible de désactiver un magasin contenant du stock ou des réservations.');
            if (pendingTransfers > 0)
              throw new ConflictException('Impossible de désactiver un magasin avec des transferts en cours.');
          }
          return tx.store.update({ where: { id }, data: { status } });
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
