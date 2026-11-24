import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ProformaInput, ProformasRepository } from '../application/proformas.port';
import { salesPricing } from './sales-pricing';
import { assertSolarDiscounts, discountedProductIds } from '../domain/solar-discounts';

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

  private validateDiscounts(
    lines: { productId: string; discount: number | Prisma.Decimal }[],
    products: { id: string; isSolarPlant: boolean }[],
  ): void {
    try {
      assertSolarDiscounts(
        lines.map((line) => ({ productId: line.productId, discount: String(line.discount) })),
        products,
      );
    } catch (error) {
      throw new ConflictException(error instanceof Error ? error.message : 'Remise commerciale invalide.');
    }
  }

  private async accessibleStores(tx: Prisma.TransactionClient, actorId: string): Promise<string[]> {
    const access = await tx.userStoreAccess.findMany({
      where: { userId: actorId, user: { status: 'ACTIVE' }, store: { status: 'ACTIVE' } },
      select: { storeId: true },
    });
    return access.map((item) => item.storeId);
  }

  private effectiveStatus<T extends { status: DocumentStatus; expiresAt: Date | null }>(
    item: T,
    now: Date,
  ): T {
    return item.status === DocumentStatus.ISSUED && item.expiresAt && item.expiresAt <= now
      ? { ...item, status: DocumentStatus.EXPIRED }
      : item;
  }

  async list(actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const ids = await this.accessibleStores(tx, actorId);
        if (!ids.length) return [];
        const rows = await tx.proforma.findMany({
          where: { lines: { some: {}, every: { storeId: { in: ids } } } },
          include: { lines: true },
          orderBy: { createdAt: 'desc' },
        });
        const now = new Date();
        return rows.map((item) => this.effectiveStatus(item, now));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async find(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const ids = await this.accessibleStores(tx, actorId);
        if (!ids.length) return null;
        const item = await tx.proforma.findFirst({
          where: { id, lines: { some: {}, every: { storeId: { in: ids } } } },
          include: { lines: true },
        });
        return item ? this.effectiveStatus(item, new Date()) : null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async create(input: ProformaInput, actorId: string) {
    const pricing = salesPricing(input.lines);
    const lines = input.lines.map((line, index) => ({
      productId: line.productId,
      storeId: line.storeId,
      quantity: new Prisma.Decimal(line.quantity),
      unitPrice: new Prisma.Decimal(line.unitPrice),
      discount: new Prisma.Decimal(line.discount),
      taxRate: new Prisma.Decimal(line.taxRate),
      lineTotal: new Prisma.Decimal(pricing.lines[index].total),
    }));
    const total = new Prisma.Decimal(pricing.totalTtc);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
          if (!customer) throw new NotFoundException('Client introuvable.');
          if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now())
            throw new ConflictException('La date d’expiration doit être future.');
          const products = await tx.product.findMany({
            where: { id: { in: lines.map((line) => line.productId) }, active: true },
            select: { id: true, isSolarPlant: true },
          });
          if (products.length !== new Set(lines.map((line) => line.productId)).size)
            throw new ConflictException('Produit inexistant ou inactif.');
          this.validateDiscounts(lines, products);
          const stores = await tx.store.findMany({
            where: { id: { in: lines.map((line) => line.storeId) }, status: 'ACTIVE' },
            select: { id: true },
          });
          if (stores.length !== new Set(lines.map((line) => line.storeId)).size)
            throw new ConflictException('Magasin inexistant ou inactif.');
          await this.assertAccess(
            tx,
            lines.map((line) => line.storeId),
            actorId,
          );
          const created = await tx.proforma.create({
            data: {
              number: input.number ?? `PF-${randomUUID().slice(0, 12).toUpperCase()}`,
              customerId: input.customerId,
              total,
              ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
              lines: { create: lines },
            },
            include: { lines: true },
          });
          const storeIds = [...new Set(lines.map((line) => line.storeId))];
          await tx.auditLog.create({
            data: {
              actorId,
              action: 'PROFORMA_CREATED',
              entityType: 'Proforma',
              entityId: created.id,
              ...(storeIds.length === 1 ? { storeId: storeIds[0] } : {}),
              payload: {
                storeIds,
                customerId: input.customerId,
                lineCount: lines.length,
                discounts: lines
                  .filter((line) => line.discount.gt(0))
                  .map((line) => ({
                    productId: line.productId,
                    storeId: line.storeId,
                    amount: line.discount.toFixed(2),
                  })),
              },
            },
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Numéro de devis déjà utilisé.');
      throw error;
    }
  }
  async issue(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Proforma" WHERE id = ${id}::uuid FOR UPDATE`;
        const proforma = await tx.proforma.findUnique({ where: { id }, include: { lines: true } });
        if (!proforma) throw new NotFoundException('Devis introuvable.');
        const storeIds = [...new Set(proforma.lines.map((line) => line.storeId))];
        await this.assertAccess(tx, storeIds, actorId);
        if (proforma.status !== DocumentStatus.DRAFT) throw new ConflictException('Devis déjà traité.');
        if (proforma.expiresAt && proforma.expiresAt <= new Date())
          throw new ConflictException('Devis expiré.');
        const discountedIds = discountedProductIds(
          proforma.lines.map((line) => ({ productId: line.productId, discount: line.discount.toFixed(2) })),
        );
        if (discountedIds.length) {
          const products = await tx.product.findMany({
            where: { id: { in: discountedIds }, active: true },
            select: { id: true, isSolarPlant: true },
          });
          this.validateDiscounts(proforma.lines, products);
        }
        const updated = await tx.proforma.update({
          where: { id },
          data: { status: DocumentStatus.ISSUED, issuedAt: new Date() },
          include: { lines: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'PROFORMA_ISSUED',
            entityType: 'Proforma',
            entityId: id,
            ...(storeIds.length === 1 ? { storeId: storeIds[0] } : {}),
            payload: { storeIds, previousStatus: proforma.status },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async update(id: string, input: ProformaInput, actorId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Proforma" WHERE id = ${id}::uuid FOR UPDATE`;
          const existing = await tx.proforma.findUnique({ where: { id } });
          if (!existing) throw new NotFoundException('Devis introuvable.');
          const currentLines = await tx.proformaLine.findMany({
            where: { proformaId: id },
            select: { storeId: true },
          });
          await this.assertAccess(
            tx,
            currentLines.map((line) => line.storeId),
            actorId,
          );
          await this.assertAccess(
            tx,
            input.lines.map((line) => line.storeId),
            actorId,
          );
          if (existing.status !== DocumentStatus.DRAFT)
            throw new ConflictException('Seul un brouillon est modifiable.');
          const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
          if (!customer) throw new NotFoundException('Client introuvable.');
          if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now())
            throw new ConflictException('La date d’expiration doit être future.');
          const products = await tx.product.findMany({
            where: { id: { in: input.lines.map((line) => line.productId) }, active: true },
            select: { id: true, isSolarPlant: true },
          });
          if (products.length !== new Set(input.lines.map((line) => line.productId)).size)
            throw new ConflictException('Produit inexistant ou inactif.');
          this.validateDiscounts(input.lines, products);
          const stores = await tx.store.findMany({
            where: { id: { in: input.lines.map((line) => line.storeId) }, status: 'ACTIVE' },
            select: { id: true },
          });
          if (stores.length !== new Set(input.lines.map((line) => line.storeId)).size)
            throw new ConflictException('Magasin inexistant ou inactif.');
          const pricing = salesPricing(input.lines);
          const lines = input.lines.map((line, index) => ({
            productId: line.productId,
            storeId: line.storeId,
            quantity: new Prisma.Decimal(line.quantity),
            unitPrice: new Prisma.Decimal(line.unitPrice),
            discount: new Prisma.Decimal(line.discount),
            taxRate: new Prisma.Decimal(line.taxRate),
            lineTotal: new Prisma.Decimal(pricing.lines[index].total),
          }));
          await tx.proformaLine.deleteMany({ where: { proformaId: id } });
          const updated = await tx.proforma.update({
            where: { id },
            data: {
              number: input.number ?? existing.number,
              customerId: input.customerId,
              expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
              total: new Prisma.Decimal(pricing.totalTtc),
              lines: { create: lines },
            },
            include: { lines: true },
          });
          const storeIds = [
            ...new Set([...currentLines.map((line) => line.storeId), ...lines.map((line) => line.storeId)]),
          ];
          await tx.auditLog.create({
            data: {
              actorId,
              action: 'PROFORMA_UPDATED',
              entityType: 'Proforma',
              entityId: id,
              ...(storeIds.length === 1 ? { storeId: storeIds[0] } : {}),
              payload: {
                storeIds,
                customerId: input.customerId,
                lineCount: lines.length,
                discounts: lines
                  .filter((line) => line.discount.gt(0))
                  .map((line) => ({
                    productId: line.productId,
                    storeId: line.storeId,
                    amount: line.discount.toFixed(2),
                  })),
              },
            },
          });
          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Numéro de devis déjà utilisé.');
      throw error;
    }
  }
  async transition(id: string, from: string, to: 'ACCEPTED' | 'CANCELLED' | 'EXPIRED', actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Proforma" WHERE id = ${id}::uuid FOR UPDATE`;
        const proforma = await tx.proforma.findUnique({ where: { id }, include: { lines: true } });
        if (!proforma) throw new NotFoundException('Devis introuvable.');
        const storeIds = [...new Set(proforma.lines.map((line) => line.storeId))];
        await this.assertAccess(tx, storeIds, actorId);
        if (proforma.status === DocumentStatus.EXPIRED && to === 'EXPIRED') return proforma;
        if (proforma.status !== from)
          throw new ConflictException('Le statut de la proforma a changé. Rechargez le document.');
        const overdue = proforma.expiresAt !== null && proforma.expiresAt <= new Date();
        if (to === 'EXPIRED' && !overdue)
          throw new ConflictException('La proforma ne peut expirer qu’après sa date de validité.');
        if (from === DocumentStatus.ISSUED && overdue && to !== 'EXPIRED')
          throw new ConflictException(
            'La proforma a expiré. Enregistrez son expiration avant toute autre opération.',
          );
        const allowed =
          (from === DocumentStatus.ISSUED && (to === 'ACCEPTED' || to === 'CANCELLED' || to === 'EXPIRED')) ||
          (from === DocumentStatus.DRAFT && to === 'CANCELLED');
        if (!allowed) throw new ConflictException('Transition de statut non autorisée.');
        if (to === 'ACCEPTED' && proforma.expiresAt && proforma.expiresAt <= new Date())
          throw new ConflictException('Devis expiré.');
        const updated = await tx.proforma.update({
          where: { id },
          data: { status: to },
          include: { lines: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: `PROFORMA_${to}`,
            entityType: 'Proforma',
            entityId: id,
            ...(storeIds.length === 1 ? { storeId: storeIds[0] } : {}),
            payload: { storeIds, previousStatus: from, newStatus: to },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
