import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ProformaInput, ProformasRepository } from '../application/proformas.port';

@Injectable()
export class PrismaProformasRepository implements ProformasRepository {
  constructor(private readonly prisma: PrismaService) {}
  private async assertAccess(tx: Prisma.TransactionClient, storeIds: string[], actorId: string) {
    const ids = [...new Set(storeIds)];
    if (!ids.length) throw new ForbiddenException('Devis sans magasin autorisé.');
    const count = await tx.userStoreAccess.count({
      where: {
        userId: actorId,
        user: { status: 'ACTIVE' },
        storeId: { in: ids },
        store: { status: 'ACTIVE' },
      },
    });
    if (count !== ids.length) throw new ForbiddenException('Accès magasin refusé.');
  }

  private async accessibleStores(actorId: string): Promise<string[]> {
    const access = await this.prisma.userStoreAccess.findMany({
      where: {
        userId: actorId,
        user: { status: 'ACTIVE' },
        store: { status: 'ACTIVE' },
      },
      select: { storeId: true },
    });
    return access.map((item) => item.storeId);
  }

  async list(actorId: string) {
    const ids = await this.accessibleStores(actorId);
    if (!ids.length) return [];
    await this.expireOverdue();
    return this.prisma.proforma.findMany({
      where: { lines: { some: {}, every: { storeId: { in: ids } } } },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async find(id: string, actorId: string) {
    const ids = await this.accessibleStores(actorId);
    if (!ids.length) return null;
    await this.expireOverdue(id);
    return this.prisma.proforma.findFirst({
      where: { id, lines: { some: {}, every: { storeId: { in: ids } } } },
      include: { lines: true },
    });
  }
  private async expireOverdue(id?: string): Promise<void> {
    await this.prisma.proforma.updateMany({
      where: {
        ...(id ? { id } : {}),
        status: DocumentStatus.ISSUED,
        expiresAt: { lte: new Date() },
      },
      data: { status: DocumentStatus.EXPIRED },
    });
  }
  async create(input: ProformaInput, actorId: string) {
    const lines = input.lines.map((line) => {
      const gross = new Prisma.Decimal(line.quantity).mul(line.unitPrice);
      const net = gross.minus(line.discount);
      const total = net
        .mul(new Prisma.Decimal(1).plus(new Prisma.Decimal(line.taxRate).div(100)))
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return {
        productId: line.productId,
        storeId: line.storeId,
        quantity: new Prisma.Decimal(line.quantity),
        unitPrice: new Prisma.Decimal(line.unitPrice),
        discount: new Prisma.Decimal(line.discount),
        taxRate: new Prisma.Decimal(line.taxRate),
        lineTotal: total,
      };
    });
    const total = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
        if (!customer) throw new NotFoundException('Client introuvable.');
        if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now())
          throw new ConflictException('La date d’expiration doit être future.');
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
        await this.assertAccess(tx, lines.map((line) => line.storeId), actorId);
        return tx.proforma.create({
          data: {
            number: input.number ?? `PF-${randomUUID().slice(0, 12).toUpperCase()}`,
            customerId: input.customerId,
            total,
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
  async issue(id: string, actorId: string) {
    const visible = await this.find(id, actorId);
    if (!visible) throw new NotFoundException('Devis introuvable.');
    const result = await this.prisma.proforma.updateMany({
      where: {
        id,
        status: DocumentStatus.DRAFT,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: { status: DocumentStatus.ISSUED, issuedAt: new Date() },
    });
    if (!result.count) throw new ConflictException('Devis déjà traité.');
    return this.find(id, actorId);
  }

  async update(id: string, input: ProformaInput, actorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Proforma" WHERE id = ${id}::uuid FOR UPDATE`;
        const existing = await tx.proforma.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Devis introuvable.');
        const currentLines = await tx.proformaLine.findMany({
          where: { proformaId: id },
          select: { storeId: true },
        });
        await this.assertAccess(tx, currentLines.map((line) => line.storeId), actorId);
        await this.assertAccess(tx, input.lines.map((line) => line.storeId), actorId);
        if (existing.status !== DocumentStatus.DRAFT)
          throw new ConflictException('Seul un brouillon est modifiable.');
        const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
        if (!customer) throw new NotFoundException('Client introuvable.');
        if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now())
          throw new ConflictException('La date d’expiration doit être future.');
        const products = await tx.product.findMany({
          where: { id: { in: input.lines.map((line) => line.productId) }, active: true },
          select: { id: true },
        });
        if (products.length !== new Set(input.lines.map((line) => line.productId)).size)
          throw new ConflictException('Produit inexistant ou inactif.');
        const stores = await tx.store.findMany({
          where: { id: { in: input.lines.map((line) => line.storeId) }, status: 'ACTIVE' },
          select: { id: true },
        });
        if (stores.length !== new Set(input.lines.map((line) => line.storeId)).size)
          throw new ConflictException('Magasin inexistant ou inactif.');
        const lines = input.lines.map((line) => {
          const net = new Prisma.Decimal(line.quantity).mul(line.unitPrice).minus(line.discount);
          return {
            productId: line.productId,
            storeId: line.storeId,
            quantity: new Prisma.Decimal(line.quantity),
            unitPrice: new Prisma.Decimal(line.unitPrice),
            discount: new Prisma.Decimal(line.discount),
            taxRate: new Prisma.Decimal(line.taxRate),
            lineTotal: net
              .mul(new Prisma.Decimal(1).plus(new Prisma.Decimal(line.taxRate).div(100)))
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          };
        });
        await tx.proformaLine.deleteMany({ where: { proformaId: id } });
        return tx.proforma.update({
          where: { id },
          data: {
            number: input.number ?? existing.number,
            customerId: input.customerId,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            total: lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)),
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
  async transition(
    id: string,
    from: string,
    to: 'ACCEPTED' | 'CANCELLED' | 'EXPIRED',
    actorId: string,
  ) {
    const visible = await this.find(id, actorId);
    if (!visible) throw new NotFoundException('Devis introuvable.');
    const result = await this.prisma.proforma.updateMany({
      where: {
        id,
        status: from as DocumentStatus,
        ...(to === 'ACCEPTED' ? { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } : {}),
      },
      data: { status: to },
    });
    if (!result.count) throw new ConflictException('Transition de statut impossible.');
    return this.find(id, actorId);
  }
}
