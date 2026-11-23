import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, ReceiptStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CreateReceiptInput, GoodsReceiptsRepository } from '../application/goods-receipts.port';

@Injectable()
export class PrismaGoodsReceiptsRepository implements GoodsReceiptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async authorize(tx: Prisma.TransactionClient, storeId: string, actorId: string) {
    const [store, user, access] = await Promise.all([
      tx.store.findUnique({ where: { id: storeId }, select: { status: true } }),
      tx.user.findUnique({
        where: { id: actorId },
        select: { status: true, roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } } },
      }),
      tx.userStoreAccess.findUnique({ where: { userId_storeId: { userId: actorId, storeId } } }),
    ]);
    if (!user || user.status !== 'ACTIVE' || (!access && user.roles.length === 0))
      throw new ForbiddenException('Accès au magasin interdit.');
    if (!store || store.status !== 'ACTIVE') throw new ConflictException('Magasin introuvable ou inactif.');
  }

  private async isActiveAdmin(actorId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: {
        status: true,
        roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } },
      },
    });
    return user?.status === 'ACTIVE' && user.roles.length > 0;
  }

  async list(actorId: string) {
    const isAdmin = await this.isActiveAdmin(actorId);
    return this.prisma.goodsReceipt.findMany({
      where: isAdmin
        ? { store: { status: 'ACTIVE' } }
        : {
            store: {
              status: 'ACTIVE',
              userAccess: { some: { userId: actorId, user: { status: 'ACTIVE' } } },
            },
          },
      include: { lines: true },
      orderBy: { number: 'desc' },
    });
  }

  async get(id: string, actorId: string) {
    const isAdmin = await this.isActiveAdmin(actorId);
    const receipt = await this.prisma.goodsReceipt.findFirst({
      where: isAdmin
        ? { id, store: { status: 'ACTIVE' } }
        : {
            id,
            store: {
              status: 'ACTIVE',
              userAccess: { some: { userId: actorId, user: { status: 'ACTIVE' } } },
            },
          },
      include: { lines: true },
    });
    if (!receipt) throw new NotFoundException('Réception introuvable.');
    return receipt;
  }
  async create(input: CreateReceiptInput, actorId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.authorize(tx, input.storeId, actorId);
          const order = await tx.purchaseOrder.findUnique({
            where: { id: input.purchaseOrderId },
            include: { lines: true },
          });
          if (
            !order ||
            (order.status !== OrderStatus.CONFIRMED && order.status !== OrderStatus.PARTIALLY_DELIVERED)
          )
            throw new ConflictException('Commande fournisseur non confirmée.');
          if (!input.lines.length || input.lines.length > 100)
            throw new ConflictException('Une réception doit contenir entre 1 et 100 lignes.');
          if (
            input.lines.some(
              (line) =>
                !Number.isFinite(line.quantity) ||
                line.quantity <= 0 ||
                !Number.isFinite(line.unitCost) ||
                line.unitCost < 0 ||
                !/^\d+(?:\.\d{1,3})?$/.test(String(line.quantity)) ||
                !/^\d+(?:\.\d{1,2})?$/.test(String(line.unitCost)),
            )
          )
            throw new ConflictException('Quantité ou coût unitaire invalide.');
          const receiptProducts = input.lines.map((line) => line.productId);
          if (new Set(receiptProducts).size !== receiptProducts.length)
            throw new ConflictException('Produit présent plusieurs fois dans la réception.');
          const products = new Set(order.lines.map((line) => line.productId));
          if (input.lines.some((line) => !products.has(line.productId)))
            throw new ConflictException('Produit absent de la commande.');
          const created = await tx.goodsReceipt.create({
            data: {
              number: input.number,
              storeId: input.storeId,
              purchaseOrderId: input.purchaseOrderId,
              lines: {
                create: input.lines.map((line) => ({
                  productId: line.productId,
                  quantity: new Prisma.Decimal(line.quantity),
                  unitCost: new Prisma.Decimal(line.unitCost),
                })),
              },
            },
            include: { lines: true },
          });
          await tx.auditLog.create({
            data: {
              actorId,
              action: 'GOODS_RECEIPT_CREATED',
              entityType: 'GoodsReceipt',
              entityId: created.id,
              storeId: input.storeId,
              payload: { purchaseOrderId: input.purchaseOrderId, lineCount: created.lines.length },
            },
          });
          return created;
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('Numéro de réception déjà utilisé.');
        if (error.code === 'P2034')
          throw new ConflictException('Conflit concurrent lors de la création de la réception. Réessayez.');
        if (error.code === 'P2003') throw new ConflictException('Commande, magasin ou produit introuvable.');
      }
      throw error;
    }
  }
  async cancel(id: string, actorId: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const receipt = await tx.goodsReceipt.findUnique({ where: { id } });
            if (!receipt) throw new NotFoundException('Réception introuvable.');
            await this.authorize(tx, receipt.storeId, actorId);
            const updated = await tx.goodsReceipt.updateMany({
              where: { id, status: ReceiptStatus.DRAFT },
              data: { status: ReceiptStatus.CANCELLED },
            });
            if (updated.count !== 1)
              throw new ConflictException('Seule une réception brouillon peut être annulée.');
            await tx.auditLog.create({
              data: {
                actorId,
                action: 'GOODS_RECEIPT_CANCELLED',
                entityType: 'GoodsReceipt',
                entityId: id,
                storeId: receipt.storeId,
                payload: { purchaseOrderId: receipt.purchaseOrderId },
              },
            });
            return tx.goodsReceipt.findUnique({ where: { id }, include: { lines: true } });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
        );
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 2) continue;
          throw new ConflictException('Conflit concurrent lors de l’annulation. Réessayez.');
        }
        throw error;
      }
    }
    throw new ConflictException('Conflit concurrent lors de l’annulation. Réessayez.');
  }

  async confirm(id: string, actorId: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.confirmOnce(id, actorId);
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 2) continue;
          throw new ConflictException('Conflit concurrent lors de la confirmation. Réessayez.');
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException('Réception ou mouvement déjà enregistré.');
        throw error;
      }
    }
    throw new ConflictException('Conflit concurrent lors de la confirmation. Réessayez.');
  }

  private confirmOnce(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const receipt = await tx.goodsReceipt.findUnique({ where: { id }, include: { lines: true } });
        if (!receipt) throw new NotFoundException('Réception introuvable.');
        await this.authorize(tx, receipt.storeId, actorId);
        if (receipt.status !== ReceiptStatus.DRAFT) throw new ConflictException('Réception déjà traitée.');
        if (!receipt.purchaseOrderId) throw new ConflictException('Commande fournisseur obligatoire.');
        if (!receipt.lines.length) throw new ConflictException('Réception sans lignes interdite.');
        if (new Set(receipt.lines.map((line) => line.productId)).size !== receipt.lines.length)
          throw new ConflictException('Réception contenant des produits en double.');
        if (
          receipt.lines.some(
            (line) =>
              !line.quantity.isFinite() ||
              line.quantity.lte(0) ||
              !line.unitCost.isFinite() ||
              line.unitCost.isNegative(),
          )
        )
          throw new ConflictException('Quantité ou coût de réception invalide.');
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${receipt.purchaseOrderId}))`;
        const order = await tx.purchaseOrder.findUnique({
          where: { id: receipt.purchaseOrderId },
          include: { lines: true },
        });
        if (
          !order ||
          (order.status !== OrderStatus.CONFIRMED && order.status !== OrderStatus.PARTIALLY_DELIVERED)
        )
          throw new ConflictException('Commande fournisseur non confirmée.');
        const prior = await tx.goodsReceipt.findMany({
          where: { purchaseOrderId: order.id, status: ReceiptStatus.CONFIRMED },
          include: { lines: true },
        });
        const received = new Map<string, Prisma.Decimal>();
        for (const item of prior)
          for (const line of item.lines)
            received.set(
              line.productId,
              (received.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantity),
            );
        const ordered = new Map<string, Prisma.Decimal>();
        for (const line of order.lines)
          ordered.set(
            line.productId,
            (ordered.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantity),
          );
        for (const line of receipt.lines) {
          const limit = ordered.get(line.productId);
          if (!limit || (received.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantity).gt(limit))
            throw new ConflictException('Quantité reçue supérieure à la commande.');
          received.set(
            line.productId,
            (received.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantity),
          );
        }
        for (const line of receipt.lines) {
          await tx.storeStock.upsert({
            where: { storeId_productId: { storeId: receipt.storeId, productId: line.productId } },
            create: { storeId: receipt.storeId, productId: line.productId, quantity: line.quantity },
            update: { quantity: { increment: line.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              storeId: receipt.storeId,
              productId: line.productId,
              type: 'RECEIPT',
              quantity: line.quantity,
              referenceType: 'GOODS_RECEIPT',
              referenceId: receipt.id,
              operationKey: `goods-receipt:${receipt.id}:${line.productId}`,
              actorId,
            },
          });
        }
        const complete = [...ordered].every(([productId, quantity]) =>
          (received.get(productId) ?? new Prisma.Decimal(0)).gte(quantity),
        );
        await tx.purchaseOrder.update({
          where: { id: order.id },
          data: { status: complete ? OrderStatus.DELIVERED : OrderStatus.PARTIALLY_DELIVERED },
        });
        const confirmed = await tx.goodsReceipt.update({
          where: { id },
          data: { status: ReceiptStatus.CONFIRMED, receivedAt: new Date() },
          include: { lines: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'GOODS_RECEIPT_CONFIRMED',
            entityType: 'GoodsReceipt',
            entityId: id,
            storeId: receipt.storeId,
            payload: {
              purchaseOrderId: order.id,
              purchaseOrderStatus: complete ? OrderStatus.DELIVERED : OrderStatus.PARTIALLY_DELIVERED,
              lines: receipt.lines.map((line) => ({
                productId: line.productId,
                quantity: line.quantity.toString(),
              })),
            },
          },
        });
        return confirmed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
    );
  }
}
