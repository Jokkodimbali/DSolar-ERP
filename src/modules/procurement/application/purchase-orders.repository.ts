import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { Prisma, OrderStatus } from '@prisma/client';
import { ConflictException, NotFoundException } from '@nestjs/common';

export interface PurchaseOrderInput {
  number: string;
  supplierId: string;
  lines: Array<{ productId: string; quantity: number; unitCost: number }>;
}
@Injectable()
export class PurchaseOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return this.prisma.purchaseOrder.findMany({
      include: { supplier: true, lines: true },
      orderBy: { orderedAt: 'desc' },
    });
  }
  find(id: string) {
    return this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { supplier: true, lines: true },
    });
  }
  async outstanding() {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { status: { in: [OrderStatus.CONFIRMED, OrderStatus.PARTIALLY_DELIVERED] } },
      select: {
        id: true,
        number: true,
        status: true,
        supplierId: true,
        orderedAt: true,
        lines: { select: { productId: true, quantity: true } },
      },
      orderBy: { orderedAt: 'asc' },
    });
    if (!orders.length) return [];
    const receipts = await this.prisma.goodsReceipt.findMany({
      where: { purchaseOrderId: { in: orders.map((order) => order.id) }, status: 'CONFIRMED' },
      select: {
        purchaseOrderId: true,
        lines: { select: { productId: true, quantity: true } },
      },
    });
    const received = new Map<string, Prisma.Decimal>();
    for (const receipt of receipts) {
      if (!receipt.purchaseOrderId) continue;
      for (const line of receipt.lines) {
        const key = `${receipt.purchaseOrderId}:${line.productId}`;
        received.set(key, (received.get(key) ?? new Prisma.Decimal(0)).plus(line.quantity));
      }
    }
    return orders
      .map((order) => {
        const lines = order.lines.map((line) => {
          const quantityReceived = received.get(`${order.id}:${line.productId}`) ?? new Prisma.Decimal(0);
          const remaining = Prisma.Decimal.max(0, line.quantity.minus(quantityReceived));
          return {
            productId: line.productId,
            orderedQuantity: line.quantity.toString(),
            receivedQuantity: quantityReceived.toString(),
            remainingQuantity: remaining.toString(),
            complete: remaining.isZero(),
          };
        });
        return {
          orderId: order.id,
          number: order.number,
          supplierId: order.supplierId,
          orderedAt: order.orderedAt,
          status: order.status,
          totalLines: lines.length,
          pendingLines: lines.filter((line) => !line.complete).length,
          lines,
        };
      })
      .filter((order) => order.pendingLines > 0);
  }

  async progress(id: string) {
    const order = await this.find(id);
    if (!order) throw new NotFoundException('Commande fournisseur introuvable.');
    const receipts = await this.prisma.goodsReceipt.findMany({
      where: { purchaseOrderId: id, status: 'CONFIRMED' },
      select: { lines: { select: { productId: true, quantity: true } } },
    });
    const received = new Map<string, Prisma.Decimal>();
    for (const receipt of receipts) {
      for (const line of receipt.lines) {
        received.set(
          line.productId,
          (received.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantity),
        );
      }
    }
    const lines = order.lines.map((line) => {
      const receivedQuantity = received.get(line.productId) ?? new Prisma.Decimal(0);
      const remaining = Prisma.Decimal.max(new Prisma.Decimal(0), line.quantity.minus(receivedQuantity));
      return {
        productId: line.productId,
        orderedQuantity: line.quantity.toString(),
        receivedQuantity: receivedQuantity.toString(),
        remainingQuantity: remaining.toString(),
        complete: remaining.isZero(),
      };
    });
    return {
      orderId: order.id,
      number: order.number,
      status: order.status,
      lines,
      totalLines: lines.length,
      completedLines: lines.filter((line) => line.complete).length,
      pendingLines: lines.filter((line) => !line.complete).length,
      complete: lines.length > 0 && lines.every((line) => line.complete),
    };
  }

  async create(input: PurchaseOrderInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.findUnique({
          where: { id: input.supplierId },
          select: { active: true },
        });
        if (!supplier) throw new NotFoundException('Fournisseur introuvable.');
        if (!supplier.active) throw new ConflictException('Fournisseur désactivé.');
        if (!input.lines.length || input.lines.length > 100)
          throw new ConflictException('La commande doit contenir entre 1 et 100 lignes.');
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
        const productIds = input.lines.map((line) => line.productId);
        if (new Set(productIds).size !== productIds.length)
          throw new ConflictException('Produit présent plusieurs fois dans la commande.');
        const products = await tx.product.findMany({
          where: { id: { in: input.lines.map((line) => line.productId) }, active: true },
          select: { id: true },
        });
        if (products.length !== input.lines.length)
          throw new ConflictException('Produit introuvable ou inactif.');
        return tx.purchaseOrder.create({
          data: {
            number: input.number,
            supplierId: input.supplierId,
            lines: {
              create: input.lines.map((line) => ({
                productId: line.productId,
                quantity: new Prisma.Decimal(line.quantity),
                unitCost: new Prisma.Decimal(line.unitCost),
              })),
            },
          },
          include: { supplier: true, lines: true },
        });
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('Numéro de commande déjà utilisé.');
        if (error.code === 'P2003') throw new ConflictException('Fournisseur ou produit introuvable.');
        if (error.code === 'P2034')
          throw new ConflictException('Conflit concurrent lors de la création de commande. Réessayez.');
      }
      throw error;
    }
  }
  async cancel(id: string, actorId?: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.purchaseOrder.updateMany({
        where: { id, status: OrderStatus.DRAFT },
        data: { status: OrderStatus.CANCELLED },
      });
      if (result.count && actorId) {
        await tx.auditLog.create({
          data: { actorId, action: 'PURCHASE_ORDER_CANCELLED', entityType: 'PurchaseOrder', entityId: id },
        });
      }
      return result;
    });
    if (updated.count === 0) {
      const existing = await this.prisma.purchaseOrder.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Commande fournisseur introuvable.');
      throw new ConflictException('Seule une commande brouillon peut être annulée.');
    }
    return this.find(id);
  }

  async confirm(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      select: { supplier: { select: { active: true } } },
    });
    if (!order) throw new NotFoundException('Commande fournisseur introuvable.');
    if (!order.supplier.active) throw new ConflictException('Fournisseur désactivé.');
    const updated = await this.prisma.purchaseOrder.updateMany({
      where: { id, status: OrderStatus.DRAFT },
      data: { status: OrderStatus.CONFIRMED },
    });
    if (updated.count === 0) {
      const existing = await this.prisma.purchaseOrder.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Commande fournisseur introuvable.');
      throw new ConflictException('Commande déjà traitée.');
    }
    return this.find(id);
  }
}
