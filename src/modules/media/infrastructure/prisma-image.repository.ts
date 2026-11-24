import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ImageInput, ImageRepository } from '../application/image.port';

const metadata = { id: true, mimeType: true, createdAt: true } as const;

@Injectable()
export class PrismaImageRepository implements ImageRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async authorize(tx: Prisma.TransactionClient, actorId: string, permission?: string) {
    const user = await tx.user.findFirst({
      where: { id: actorId, status: 'ACTIVE', roles: { some: {
        role: { code: { in: ['ADMIN', 'MAGASINIER'] }, ...(permission ? { permissions: { some: { permission: { code: permission } } } } : {}) },
      } } },
      select: { roles: { select: { role: { select: { code: true } } } } },
    });
    if (!user) throw new ForbiddenException('Accès aux images non autorisé.');
    return user;
  }

  save(actorId: string, input: ImageInput) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.authorize(tx, actorId, input.kind === 'COMPANY_LOGO' ? 'users.manage' : 'products.manage');
      if (input.kind === 'COMPANY_LOGO' && !user.roles.some((row) => row.role.code === 'ADMIN'))
        throw new ForbiddenException('Seul le super administrateur peut téléverser le logo.');
      if (input.kind === 'PRODUCT_PHOTO' && (!input.productId ||
          !await tx.product.findUnique({ where: { id: input.productId }, select: { id: true } })))
        throw new NotFoundException('Produit introuvable.');
      const image = await tx.imageAsset.create({
        data: { kind: input.kind, productId: input.productId, mimeType: input.mimeType, data: Uint8Array.from(input.data) },
        select: metadata,
      });
      await tx.auditLog.create({
        data: { actorId, action: 'IMAGE_UPLOADED', entityType: 'ImageAsset', entityId: image.id,
          payload: { kind: input.kind, productId: input.productId ?? null } },
      });
      return image;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  get(actorId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, actorId);
      const item = await tx.imageAsset.findUnique({ where: { id }, select: { kind: true } });
      if (!item) return null;
      if (item.kind === 'PRODUCT_PHOTO') await this.authorize(tx, actorId, 'products.read');
      return tx.imageAsset.findUnique({ where: { id }, select: { mimeType: true, data: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  latestProduct(actorId: string, productId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, actorId, 'products.read');
      return tx.imageAsset.findFirst({ where: { kind: 'PRODUCT_PHOTO', productId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: metadata });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
