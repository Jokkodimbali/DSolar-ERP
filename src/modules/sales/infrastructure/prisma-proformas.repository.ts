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
      where: { userId: actorId, user: { status: 'ACTIVE' }, storeId: { in: ids }, store: { status: 'ACTIVE' } },
    });
    if (count !== ids.length) throw new ForbiddenException('Accès magasin refusé.');
  }

  private async accessibleStores(actorId: string): Promise<string[]> {
    const access = await this.prisma.userStoreAccess.findMany({
      where: { userId: actorId, user: { status: 'ACTIVE' }, store: { status: 'ACTIVE' } },
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
