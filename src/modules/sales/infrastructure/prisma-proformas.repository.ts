import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ProformaInput, ProformasRepository } from '../application/proformas.port';

@Injectable()
export class PrismaProformasRepository implements ProformasRepository {
  constructor(private readonly prisma: PrismaService) {}
  list() { return this.prisma.proforma.findMany({ include: { lines: true }, orderBy: { createdAt: 'desc' } }); }
  find(id: string) { return this.prisma.proforma.findUnique({ where: { id }, include: { lines: true } }); }
  async create(input: ProformaInput) {
    const lines = input.lines.map((line) => {
      const gross = new Prisma.Decimal(line.quantity).mul(line.unitPrice);
      const net = gross.minus(line.discount);
      const total = net.mul(new Prisma.Decimal(1).plus(new Prisma.Decimal(line.taxRate).div(100)))
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return {
        productId: line.productId, storeId: line.storeId,
        quantity: new Prisma.Decimal(line.quantity), unitPrice: new Prisma.Decimal(line.unitPrice),
        discount: new Prisma.Decimal(line.discount), taxRate: new Prisma.Decimal(line.taxRate),
        lineTotal: total,
      };
    });
    const total = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
        if (!customer) throw new NotFoundException('Client introuvable.');
        const products = await tx.product.findMany({
          where: { id: { in: lines.map((line) => line.productId) }, active: true },
          select: { id: true },
        });
        if (products.length !== new Set(lines.map((line) => line.productId)).size)
          throw new ConflictException('Produit inexistant ou inactif.');
        const stores = await tx.store.findMany({
          where: { id: { in: lines.map((line) => line.storeId) }, status: 'ACTIVE' },
          select: { id: true },
        });
        if (stores.length !== new Set(lines.map((line) => line.storeId)).size)
          throw new ConflictException('Magasin inexistant ou inactif.');
        return tx.proforma.create({
          data: {
            number: input.number, customerId: input.customerId, total,
            ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
            lines: { create: lines },
          },
          include: { lines: true },
        });
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Numéro de devis déjà utilisé.');
      throw error;
    }
  }
  async issue(id: string) {
    const result = await this.prisma.proforma.updateMany({
      where: { id, status: DocumentStatus.DRAFT },
      data: { status: DocumentStatus.ISSUED, issuedAt: new Date() },
    });
    if (!result.count) throw new ConflictException('Devis déjà traité.');
    return this.find(id);
  }
}
