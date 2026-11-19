import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CustomerInput, CustomersRepository } from '../application/customers.port';

@Injectable()
export class PrismaCustomersRepository implements CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}
  list() { return this.prisma.customer.findMany({ orderBy: { name: 'asc' } }); }
  find(id: string) { return this.prisma.customer.findUnique({ where: { id } }); }
  create(input: CustomerInput) { return this.prisma.customer.create({ data: input }); }
  async update(id: string, input: Partial<CustomerInput>) {
    try {
      return await this.prisma.customer.update({ where: { id }, data: input });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw new NotFoundException('Client introuvable.');
      throw error;
    }
  }
}
