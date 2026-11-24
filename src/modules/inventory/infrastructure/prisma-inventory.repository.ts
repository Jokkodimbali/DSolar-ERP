import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, MovementType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  InventoryRepository,
  StockAdjustment,
  StockBalance,
  StoreStockItem,
} from '../application/inventory.port';

@Injectable()
export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}
  private async authorize(tx: Prisma.TransactionClient, storeId: string, productId: string, actorId: string) {
    const [store, product, user, access] = await Promise.all([
      tx.store.findUnique({ where: { id: storeId }, select: { status: true } }),
      tx.product.findUnique({ where: { id: productId }, select: { active: true } }),
      tx.user.findUnique({
        where: { id: actorId },
        select: { status: true, roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } } },
      }),
      tx.userStoreAccess.findFirst({ where: { storeId, userId: actorId } }),
    ]);
    if (!store || !product) throw new NotFoundException('Magasin ou produit introuvable.');
    if (store.status !== 'ACTIVE' || !product.active)
      throw new ConflictException('Magasin ou produit inactif.');
    if (!user || user.status !== 'ACTIVE' || (!access && user.roles.length === 0))
      throw new ForbiddenException('Accès à ce magasin non autorisé.');
  }
  private format(
    storeId: string,
    productId: string,
    quantity: Prisma.Decimal,
    reserved: Prisma.Decimal,
  ): StockBalance {
    return {
      storeId,
      productId,
      quantity: quantity.toFixed(3),
      reserved: reserved.toFixed(3),
      available: quantity.minus(reserved).toFixed(3),
    };
  }
  async listStoreStock(storeId: string, actorId: string): Promise<StoreStockItem[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const [store, user, access] = await Promise.all([
          tx.store.findUnique({ where: { id: storeId }, select: { status: true } }),
          tx.user.findUnique({
            where: { id: actorId },
            select: {
              status: true,
              roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } },
            },
          }),
          tx.userStoreAccess.findFirst({ where: { storeId, userId: actorId } }),
        ]);
        if (!store) throw new NotFoundException('Magasin introuvable.');
        if (store.status !== 'ACTIVE') throw new ConflictException('Magasin inactif.');
        if (!user || user.status !== 'ACTIVE' || (!access && user.roles.length === 0)) {
          throw new ForbiddenException('Accès à ce magasin non autorisé.');
        }
        const stocks = await tx.storeStock.findMany({
          where: { storeId, product: { active: true } },
          select: {
            productId: true,
            quantity: true,
            reserved: true,
            product: { select: { sku: true, name: true, unit: true } },
          },
          orderBy: { product: { name: 'asc' } },
        });
        return stocks.map((stock) => ({
          ...this.format(storeId, stock.productId, stock.quantity, stock.reserved),
          sku: stock.product.sku,
          name: stock.product.name,
          unit: stock.product.unit,
        }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async getBalance(storeId: string, productId: string, actorId: string): Promise<StockBalance> {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, storeId, productId, actorId);
      const stock = await tx.storeStock.findUnique({ where: { storeId_productId: { storeId, productId } } });
      return this.format(
        storeId,
        productId,
        stock?.quantity ?? new Prisma.Decimal(0),
        stock?.reserved ?? new Prisma.Decimal(0),
      );
    });
  }
  async adjust(command: StockAdjustment): Promise<StockBalance> {
    const { storeId, productId, actorId, operationKey } = command;
    const amount = new Prisma.Decimal(command.quantity);
    const signed = command.direction === 'IN' ? amount : amount.negated();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.authorize(tx, storeId, productId, actorId);
          const prior = await tx.stockMovement.findUnique({ where: { operationKey } });
          if (prior) {
            if (
              prior.referenceType !== 'MANUAL_ADJUSTMENT' ||
              prior.type !== MovementType.INVENTORY_ADJUSTMENT ||
              (prior.actorId !== null && prior.actorId !== actorId) ||
              prior.storeId !== storeId ||
              prior.productId !== productId ||
              !prior.quantity.equals(signed) ||
              prior.reason !== command.reason
            )
              throw new ConflictException('Clé d’opération déjà utilisée avec des paramètres différents.');
            const current = await tx.storeStock.findUnique({
              where: { storeId_productId: { storeId, productId } },
            });
            return this.format(
              storeId,
              productId,
              current?.quantity ?? new Prisma.Decimal(0),
              current?.reserved ?? new Prisma.Decimal(0),
            );
          }
          await tx.storeStock.upsert({
            where: { storeId_productId: { storeId, productId } },
            create: { storeId, productId, quantity: new Prisma.Decimal(0), reserved: new Prisma.Decimal(0) },
            update: {},
          });
          const changed = await tx.storeStock.updateMany({
            where: {
              storeId,
              productId,
              ...(command.direction === 'OUT'
                ? { quantity: { gte: amount }, reserved: { lte: new Prisma.Decimal(0) } }
                : {}),
            },
            data: { quantity: { increment: signed } },
          });
          if (changed.count !== 1) {
            throw new ConflictException('Stock insuffisant ou stock réservé : ajustement refusé.');
          }
          const movement = await tx.stockMovement.create({
            data: {
              storeId,
              productId,
              operationKey,
              quantity: signed,
              type: MovementType.INVENTORY_ADJUSTMENT,
              referenceType: 'MANUAL_ADJUSTMENT',
              referenceId: operationKey,
              actorId,
              reason: command.reason,
            },
          });
          const updated = await tx.storeStock.findUniqueOrThrow({
            where: { storeId_productId: { storeId, productId } },
          });
          await tx.auditLog.create({
            data: {
              actorId,
              storeId,
              action: 'STOCK_MANUAL_ADJUSTMENT',
              entityType: 'StockMovement',
              entityId: movement.id,
              payload: {
                productId, operationKey, direction: command.direction,
                quantity: amount.toFixed(3), resultingQuantity: updated.quantity.toFixed(3),
                resultingReserved: updated.reserved.toFixed(3),
              },
            },
          });
          return this.format(storeId, productId, updated.quantity, updated.reserved);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))
        throw new ConflictException(
          'Conflit concurrent ou opération déjà enregistrée. Réessayez avec la même clé.',
        );
      throw error;
    }
  }
}
