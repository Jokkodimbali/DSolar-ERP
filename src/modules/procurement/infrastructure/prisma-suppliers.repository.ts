import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SupplierInput, SuppliersRepository } from '../application/suppliers.repository';

@Injectable()
export class PrismaSuppliersRepository implements SuppliersRepository {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }
  find(id: string) {
    return this.prisma.supplier.findUnique({ where: { id } });
  }
  create(input: SupplierInput, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({ data: input });
      await tx.auditLog.create({
        data: { actorId, action: 'SUPPLIER_CREATED', entityType: 'Supplier', entityId: created.id },
      });
      return created;
    });
  }
  async update(id: string, input: Partial<SupplierInput>, actorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.supplier.update({ where: { id }, data: input });
        const action = input.active === true
          ? 'SUPPLIER_ACTIVATED'
          : input.active === false
            ? 'SUPPLIER_DEACTIVATED'
            : 'SUPPLIER_UPDATED';
        await tx.auditLog.create({
          data: { actorId, action, entityType: 'Supplier', entityId: id },
        });
        return updated;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw new NotFoundException('Fournisseur introuvable.');
      throw error;
    }
  }
  async activate(id: string, actorId: string) {
    return this.update(id, { active: true } as Partial<SupplierInput>, actorId);
  }
  async deactivate(id: string, actorId: string) {
    return this.update(id, { active: false } as Partial<SupplierInput>, actorId);
  }
}
