import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CustomerCreationKey, CustomerInput, CustomersRepository } from '../application/customers.port';

@Injectable()
export class PrismaCustomersRepository implements CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return this.prisma.customer.findMany({ orderBy: { name: 'asc' } });
  }
  find(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }
  async create(input: CustomerInput, actorId: string, operation?: CustomerCreationKey) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (operation)
          await tx.idempotencyKey.create({ data: { key: operation.key, operation: 'CUSTOMER_CREATE' } });
        const created = await tx.customer.create({ data: input });
        await tx.auditLog.create({
          data: { actorId, action: 'CUSTOMER_CREATED', entityType: 'Customer', entityId: created.id },
        });
        if (operation)
          await tx.idempotencyKey.update({
            where: { key: operation.key },
            data: { response: { id: created.id, fingerprint: operation.fingerprint } },
          });
        return created;
      });
    } catch (error: unknown) {
      if (!operation || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.prisma.idempotencyKey.findUnique({ where: { key: operation.key } });
      const response = existing?.response;
      if (
        existing?.operation !== 'CUSTOMER_CREATE' ||
        !response ||
        typeof response !== 'object' ||
        Array.isArray(response) ||
        response['fingerprint'] !== operation.fingerprint ||
        typeof response['id'] !== 'string'
      )
        throw new ConflictException('Clé de création déjà utilisée avec des données différentes.');
      const customer = await this.find(response['id']);
      if (!customer) throw new ConflictException('Client associé à cette opération introuvable.');
      return customer;
    }
  }
  async update(id: string, input: Partial<CustomerInput>, actorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({ where: { id }, data: input });
        await tx.auditLog.create({
          data: { actorId, action: 'CUSTOMER_UPDATED', entityType: 'Customer', entityId: id },
        });
        return updated;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw new NotFoundException('Client introuvable.');
      throw error;
    }
  }
}
