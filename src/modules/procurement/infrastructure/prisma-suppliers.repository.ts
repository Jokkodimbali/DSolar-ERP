import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SupplierInput, SuppliersRepository } from '../application/suppliers.repository';

@Injectable()
export class PrismaSuppliersRepository implements SuppliersRepository {
  constructor(private readonly prisma: PrismaService) {}
  list() { return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } }); }
  find(id: string) { return this.prisma.supplier.findUnique({ where: { id } }); }
  create(input: SupplierInput) { return this.prisma.supplier.create({ data: input }); }
  async update(id: string, input: Partial<SupplierInput>) {
    try {
      return await this.prisma.supplier.update({ where: { id }, data: input });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw new NotFoundException('Fournisseur introuvable.');
      throw error;
    }
  }
  async deactivate(id: string) {
    return this.update(id, { active: false } as Partial<SupplierInput>);
  }
}
