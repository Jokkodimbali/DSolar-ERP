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
      tx.user.findUnique({ where: { id: actorId }, select: { status: true } }),
      tx.userStoreAccess.findUnique({ where: { userId_storeId: { userId: actorId, storeId } } }),
    ]);
    if (!user || user.status !== 'ACTIVE' || !access)
      throw new ForbiddenException('Accès au magasin interdit.');
    if (!store || store.status !== 'ACTIVE') throw new ConflictException('Magasin introuvable ou inactif.');
  }

  list(actorId: string) {
    return this.prisma.goodsReceipt.findMany({
      where: { store: { userAccess: { some: { userId: actorId } } } },
      include: { lines: true },
      orderBy: { number: 'desc' },
    });
  }
  async get(id: string, actorId: string) {
    const receipt = await this.prisma.goodsReceipt.findFirst({
      where: { id, store: { userAccess: { some: { userId: actorId } } } },
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
            !(order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.PARTIALLY_DELIVERED)
          )
            throw new ConflictException('Commande fournisseur non confirmée.');
          const products = new Set(order.lines.map((line) => line.productId));
          if (input.lines.some((line) => !products.has(line.productId)))
            throw new ConflictException('Produit absent de la commande.');
          return tx.goodsReceipt.create({
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
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Numéro de réception déjà utilisé.');
      throw error;
    }
  }
  async confirm(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const receipt = await tx.goodsReceipt.findUnique({ where: { id }, include: { lines: true } });
        if (!receipt) throw new NotFoundException('Réception introuvable.');
        await this.authorize(tx, receipt.storeId, actorId);
        if (receipt.status !== ReceiptStatus.DRAFT) throw new ConflictException('Réception déjà traitée.');
        if (!receipt.purchaseOrderId) throw new ConflictException('Commande fournisseur obligatoire.');
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${receipt.purchaseOrderId}))`;
        const order = await tx.purchaseOrder.findUnique({
          where: { id: receipt.purchaseOrderId },
          include: { lines: true },
        });
        if (
          !order ||
          !(order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.PARTIALLY_DELIVERED)
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
        return tx.goodsReceipt.update({
          where: { id },
          data: { status: ReceiptStatus.CONFIRMED, receivedAt: new Date() },
          include: { lines: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
    );
  }
}
