import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ProductRepository, ProductSearch } from '../application/product.repository';
import { CreateProduct, UpdateProduct } from '../domain/product';
@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaService) {}
  list(active?: boolean) {
    return this.prisma.product.findMany({
      where: active === undefined ? {} : { active },
      orderBy: { name: 'asc' },
    });
  }
  search(query: ProductSearch) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      active: query.active, categoryId: query.categoryId, brandId: query.brandId,
      taxRegimeId: query.taxRegimeId, isSolarPlant: query.isSolarPlant,
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const [items, total] = await Promise.all([
        tx.product.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
        tx.product.count({ where }),
      ]);
      return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  findById(id: string) {
    return this.prisma.product.findUnique({ where: { id } });
  }
  findBySku(sku: string) {
    return this.prisma.product.findUnique({ where: { sku } });
  }
  async create(input: CreateProduct) {
    try {
      return await this.prisma.product.create({ data: input });
    } catch (e: unknown) {
      this.mapError(e);
      throw e;
    }
  }
  async update(id: string, input: UpdateProduct) {
    try {
      return await this.prisma.product.update({ where: { id }, data: input });
    } catch (e: unknown) {
      this.mapError(e);
      throw e;
    }
  }
  async setActive(id: string, active: boolean) {
    try {
      return await this.prisma.product.update({ where: { id }, data: { active } });
    } catch (e: unknown) {
      this.mapError(e);
      throw e;
    }
  }
  private mapError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') throw new ConflictException('Ce SKU existe déjà.');
      if (e.code === 'P2003') throw new BadReferenceException();
      if (e.code === 'P2025') throw new NotFoundException('Produit introuvable.');
    }
  }
}
class BadReferenceException extends ConflictException {
  constructor() {
    super('Catégorie, marque ou régime fiscal invalide.');
  }
}
