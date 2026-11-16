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
  async create(input: PurchaseOrderInput) {
    try {
      return await this.prisma.purchaseOrder.create({
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
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('Numéro de commande déjà utilisé.');
        if (error.code === 'P2003') throw new ConflictException('Fournisseur ou produit introuvable.');
      }
      throw error;
    }
  }
  async confirm(id: string) {
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
