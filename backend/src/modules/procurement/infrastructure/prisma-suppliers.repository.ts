import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SupplierCreationKey, SupplierInput, SuppliersRepository } from '../application/suppliers.repository';

@Injectable()
export class PrismaSuppliersRepository implements SuppliersRepository {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }
  find(id: string) {
    return this.prisma.supplier.findUnique({ where: { id } });
  }
  async create(input: SupplierInput, actorId: string, operation?: SupplierCreationKey) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (operation) {
          await tx.idempotencyKey.create({
            data: { key: operation.key, operation: 'SUPPLIER_CREATE' },
          });
        }
        const created = await tx.supplier.create({ data: input });
        await tx.auditLog.create({
          data: { actorId, action: 'SUPPLIER_CREATED', entityType: 'Supplier', entityId: created.id },
        });
        if (operation) {
          await tx.idempotencyKey.update({
            where: { key: operation.key },
            data: { response: { id: created.id, fingerprint: operation.fingerprint } },
          });
        }
        return created;
      });
    } catch (error: unknown) {
      if (!operation || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.prisma.idempotencyKey.findUnique({ where: { key: operation.key } });
      const response = existing?.response;
      if (
        existing?.operation !== 'SUPPLIER_CREATE' ||
        !response ||
        typeof response !== 'object' ||
        Array.isArray(response) ||
        response['fingerprint'] !== operation.fingerprint ||
        typeof response['id'] !== 'string'
      )
        throw new ConflictException(
          'Cette opération de création a déjà été utilisée avec des données différentes.',
        );
      const supplier = await this.find(response['id']);
      if (!supplier) throw new ConflictException('Le fournisseur associé à cette opération est introuvable.');
      return supplier;
    }
  }
  async update(id: string, input: Partial<SupplierInput>, actorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.supplier.update({ where: { id }, data: input });
        const active = (input as Partial<SupplierInput> & { active?: boolean }).active;
        const action =
          active === true
            ? 'SUPPLIER_ACTIVATED'
            : active === false
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
