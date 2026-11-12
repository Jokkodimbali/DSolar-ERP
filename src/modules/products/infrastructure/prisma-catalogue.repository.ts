import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CatalogueRepository, ReferenceKind } from '../application/catalogue.repository';
@Injectable()
export class PrismaCatalogueRepository implements CatalogueRepository {
  constructor(private readonly prisma: PrismaService) {}
  listReferences(kind: ReferenceKind) {
    switch (kind) {
      case 'category': return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
      case 'brand': return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
      case 'taxRegime': return this.prisma.taxRegime.findMany({ orderBy: { name: 'asc' } });
    }
  }
  findReference(kind: ReferenceKind, id: string) {
    switch (kind) {
      case 'category': return this.prisma.category.findUnique({ where: { id } });
      case 'brand': return this.prisma.brand.findUnique({ where: { id } });
      case 'taxRegime': return this.prisma.taxRegime.findUnique({ where: { id } });
    }
  }
  async createCategory(input: { code: string; name: string; parentId?: string }) {
    try { return await this.prisma.category.create({ data: input }); } catch (error: unknown) { this.map(error); throw error; }
  }
  async createBrand(input: { name: string }) {
    try { return await this.prisma.brand.create({ data: input }); } catch (error: unknown) { this.map(error); throw error; }
  }
  async createTaxRegime(input: { code: string; name: string; rate: string; legalBasis?: string }) {
    try { return await this.prisma.taxRegime.create({ data: input }); } catch (error: unknown) { this.map(error); throw error; }
  }
  listPrices(productId: string) { return this.prisma.productPrice.findMany({ where: { productId }, orderBy: { validFrom: 'desc' } }); }
  async setPrice(input: { productId: string; purchasePrice?: string; salePrice: string; validFrom: Date }) {
    try {
      return await this.prisma.$transaction(async tx => {
        // Une seule période ouverte par produit. La contrainte SQL unique partielle
        // documentée dans migrations/ garantit aussi cette règle en concurrence.
        await tx.productPrice.updateMany({ where: { productId: input.productId, validTo: null }, data: { validTo: input.validFrom } });
        return tx.productPrice.create({ data: input });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) { this.map(error); throw error; }
  }
  private map(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException('Cette référence existe déjà ou une tarification concurrente a été enregistrée.');
      if (error.code === 'P2003') throw new ConflictException('Référence associée introuvable.');
      if (error.code === 'P2025') throw new NotFoundException('Référence introuvable.');
      if (error.code === 'P2034') throw new ConflictException('Modification concurrente. Veuillez réessayer.');
    }
  }
}
