import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, MovementType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { InventoryRepository, StockAdjustment, StockBalance } from '../application/inventory.port';

@Injectable()
export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}
  private async authorize(tx: Prisma.TransactionClient, storeId: string, productId: string, actorId: string) {
    const [store, product, user, access] = await Promise.all([
      tx.store.findUnique({ where: { id: storeId }, select: { status: true } }),
      tx.product.findUnique({ where: { id: productId }, select: { active: true } }),
      tx.user.findUnique({ where: { id: actorId }, select: { status: true } }),
      tx.userStoreAccess.findFirst({ where: { storeId, userId: actorId } }),
    ]);
    if (!store || !product) throw new NotFoundException('Magasin ou produit introuvable.');
    if (store.status !== 'ACTIVE' || !product.active)
      throw new ConflictException('Magasin ou produit inactif.');
    if (!user || user.status !== 'ACTIVE' || !access)
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
          await tx.stockMovement.create({
            data: {
              storeId,
              productId,
              operationKey,
              quantity: signed,
              type: MovementType.INVENTORY_ADJUSTMENT,
              referenceType: 'MANUAL_ADJUSTMENT',
              referenceId: operationKey,
              reason: command.reason,
            },
          });
          const updated = await tx.storeStock.findUniqueOrThrow({
            where: { storeId_productId: { storeId, productId } },
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
