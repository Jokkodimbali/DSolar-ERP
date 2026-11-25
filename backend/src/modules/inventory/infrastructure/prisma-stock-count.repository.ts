import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { pageBounds, pageResult, type ListCriteria } from '../../../shared/pagination';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { validStockQuantity } from '../domain/stock-quantity';
import { CountLineInput, StockCountRepository } from '../application/stock-count.port';

@Injectable()
export class PrismaStockCountRepository implements StockCountRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async authorize(tx: Prisma.TransactionClient, storeId: string, actorId: string) {
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
    if (!user || user.status !== 'ACTIVE' || (!access && user.roles.length === 0)) {
      throw new ForbiddenException('Accès au magasin non autorisé.');
    }
    if (!store) throw new NotFoundException('Magasin introuvable.');
    if (store.status !== 'ACTIVE') throw new ConflictException('Magasin inactif.');
  }

  private async session(tx: Prisma.TransactionClient, id: string, actorId: string) {
    const session = await tx.inventorySession.findUnique({
      where: { id },
      include: { lines: { orderBy: { productId: 'asc' } } },
    });
    if (!session) throw new NotFoundException('Inventaire introuvable.');
    await this.authorize(tx, session.storeId, actorId);
    return session;
  }

  private async execute<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        throw new ConflictException('Inventaire modifié simultanément. Veuillez réessayer.');
      }
      throw error;
    }
  }

  start(storeId: string, actorId: string) {
    return this.execute(async (tx) => {
      await this.authorize(tx, storeId, actorId);
      const existing = await tx.inventorySession.findFirst({
        where: { storeId, status: 'DRAFT' },
        select: { id: true },
      });
      if (existing) throw new ConflictException('Un inventaire est déjà ouvert dans ce magasin.');
      const stocks = await tx.storeStock.findMany({
        where: { storeId, product: { active: true } },
        select: { productId: true, quantity: true, physicalRevision: true },
      });
      if (!stocks.length) throw new ConflictException('Aucun stock à inventorier dans ce magasin.');
      const created = await tx.inventorySession.create({
        data: {
          storeId,
          lines: {
            create: stocks.map((stock) => ({
              productId: stock.productId,
              expected: stock.quantity,
              expectedStockRevision: stock.physicalRevision,
            })),
          },
        },
        include: { lines: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'INVENTORY_STARTED',
          entityType: 'InventorySession',
          entityId: created.id,
          storeId,
          payload: { lineCount: created.lines.length },
        },
      });
      return created;
    });
  }

  list(storeId: string, actorId: string, query: ListCriteria) {
    const { page, limit, skip } = pageBounds(query);
    return this.execute(async (tx) => {
      await this.authorize(tx, storeId, actorId);
      const search = query.search?.trim();
      const where: Prisma.InventorySessionWhereInput = {
        storeId,
        ...(search ? { status: { contains: search, mode: 'insensitive' } } : {}),
      };
      const [total, items] = await Promise.all([
        tx.inventorySession.count({ where }),
        tx.inventorySession.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          select: { id: true, storeId: true, status: true, startedAt: true, validatedAt: true },
        }),
      ]);
      return pageResult(items, total, page, limit);
    });
  }

  get(id: string, actorId: string) {
    return this.execute(async (tx) => {
      await this.session(tx, id, actorId);
      return tx.inventorySession.findUniqueOrThrow({
        where: { id },
        include: {
          lines: {
            orderBy: { productId: 'asc' },
            include: { product: { select: { name: true, sku: true, unit: true } } },
          },
        },
      });
    });
  }

  record(id: string, actorId: string, lines: CountLineInput[]) {
    return this.execute(async (tx) => {
      const session = await this.session(tx, id, actorId);
      if (session.status !== 'DRAFT') {
        throw new ConflictException('Cet inventaire est déjà validé.');
      }
      if (!lines.length || lines.length > 100)
        throw new ConflictException('Entre 1 et 100 lignes de comptage sont requises.');
      const productIds = lines.map((line) => line.productId);
      if (new Set(productIds).size !== productIds.length) {
        throw new ConflictException('Un produit ne peut être compté plusieurs fois.');
      }
      const products = new Map(session.lines.map((line) => [line.productId, line]));
      const changes = lines.map((line) => {
        const previous = products.get(line.productId);
        if (!previous) throw new NotFoundException('Produit absent de la session d’inventaire.');
        if (!validStockQuantity(line.counted))
          throw new ConflictException('Quantité comptée invalide (trois décimales maximum).');
        if (line.reason !== undefined && (typeof line.reason !== 'string' || line.reason.length > 500))
          throw new ConflictException('Justification invalide.');
        return {
          productId: line.productId,
          previous: previous.counted?.toFixed(3) ?? null,
          previousReason: previous.reason ?? null,
          counted: new Prisma.Decimal(line.counted),
          reason: line.reason?.trim() || null,
        };
      });
      for (const line of changes) {
        await tx.inventoryLine.update({
          where: { sessionId_productId: { sessionId: id, productId: line.productId } },
          data: { counted: line.counted, reason: line.reason },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'INVENTORY_COUNT_RECORDED',
          entityType: 'InventorySession',
          entityId: id,
          storeId: session.storeId,
          payload: {
            lines: changes.map((line) => ({
              productId: line.productId,
              previous: line.previous,
              previousReason: line.previousReason,
              counted: line.counted.toFixed(3),
              reason: line.reason,
            })),
          },
        },
      });
      return tx.inventorySession.findUniqueOrThrow({
        where: { id },
        include: { lines: { orderBy: { productId: 'asc' } } },
      });
    });
  }

  cancel(id: string, actorId: string) {
    return this.execute(async (tx) => {
      const session = await this.session(tx, id, actorId);
      if (session.status !== 'DRAFT') {
        throw new ConflictException('Seul un inventaire ouvert peut être annulé.');
      }
      const updated = await tx.inventorySession.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'CANCELLED' },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Inventaire modifié simultanément.');
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'INVENTORY_CANCELLED',
          entityType: 'InventorySession',
          entityId: id,
          storeId: session.storeId,
        },
      });
      return tx.inventorySession.findUniqueOrThrow({
        where: { id },
        include: { lines: true },
      });
    });
  }

  validate(id: string, actorId: string) {
    return this.execute(async (tx) => {
      const session = await this.session(tx, id, actorId);
      if (session.status !== 'DRAFT') throw new ConflictException('Inventaire déjà validé.');
      if (!session.lines.length || session.lines.some((line) => line.counted === null)) {
        throw new ConflictException('Toutes les lignes doivent être comptées avant validation.');
      }
      const currentProducts = await tx.storeStock.findMany({
        where: { storeId: session.storeId, product: { active: true } },
        select: { productId: true },
      });
      const expectedProducts = new Set(session.lines.map((line) => line.productId));
      if (
        currentProducts.length !== expectedProducts.size ||
        currentProducts.some((stock) => !expectedProducts.has(stock.productId))
      ) {
        throw new ConflictException('Le périmètre du stock a changé : ouvrez un nouvel inventaire.');
      }
      for (const line of session.lines) {
        const stock = await tx.storeStock.findUnique({
          where: { storeId_productId: { storeId: session.storeId, productId: line.productId } },
        });
        if (
          !stock ||
          line.expectedStockRevision === null ||
          stock.physicalRevision !== line.expectedStockRevision ||
          !stock.quantity.equals(line.expected)
        ) {
          throw new ConflictException(
            'Stock modifié depuis le début de l’inventaire : recommencez le comptage.',
          );
        }
        const counted = line.counted!;
        if (!counted.isFinite() || !validStockQuantity(counted.toFixed())) {
          throw new ConflictException('Quantité inventoriée invalide.');
        }
        if (counted.lessThan(stock.reserved)) {
          throw new ConflictException('Le stock compté ne peut pas être inférieur au stock réservé.');
        }
        const difference = counted.minus(stock.quantity);
        if (difference.isZero()) continue;
        const updated = await tx.storeStock.updateMany({
          where: {
            storeId: session.storeId,
            productId: line.productId,
            quantity: stock.quantity,
            physicalRevision: stock.physicalRevision,
            reserved: { lte: counted },
          },
          data: { quantity: { increment: difference } },
        });
        if (updated.count !== 1) throw new ConflictException('Conflit concurrent sur le stock.');
        await tx.stockMovement.create({
          data: {
            storeId: session.storeId,
            productId: line.productId,
            type: MovementType.INVENTORY_ADJUSTMENT,
            quantity: difference,
            referenceType: 'INVENTORY_SESSION',
            referenceId: id,
            operationKey: `inventory:${id}:${line.productId}`,
            actorId,
            reason: line.reason?.trim() || 'Écart de comptage physique',
          },
        });
      }
      const updated = await tx.inventorySession.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'VALIDATED', validatedAt: new Date() },
      });
      if (updated.count !== 1) throw new ConflictException('Inventaire validé simultanément.');
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'INVENTORY_VALIDATED',
          entityType: 'InventorySession',
          entityId: id,
          storeId: session.storeId,
          payload: {
            adjustedProducts: session.lines.filter((line) => !line.counted!.equals(line.expected)).length,
          },
        },
      });
      return tx.inventorySession.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    });
  }
}
