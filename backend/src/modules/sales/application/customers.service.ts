import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CUSTOMERS_REPOSITORY, CustomerInput, CustomersRepository } from './customers.port';

@Injectable()
export class CustomersService {
  constructor(@Inject(CUSTOMERS_REPOSITORY) private readonly customers: CustomersRepository) {}
  list() {
    return this.customers.list();
  }
  async get(id: string) {
    const customer = await this.customers.find(id);
    if (!customer) throw new NotFoundException('Client introuvable.');
    return customer;
  }
  async create(input: CustomerInput, actorId: string, operationKey?: string) {
    const cleaned = this.normalize(input);
    this.validate(cleaned);
    if (!cleaned.name) throw new BadRequestException('Le nom du client est obligatoire.');
    if (!operationKey) return this.customers.create(cleaned as CustomerInput, actorId);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          cleaned.name,
          cleaned.taxId ?? null,
          cleaned.phone ?? null,
          cleaned.email ?? null,
          cleaned.address ?? null,
        ]),
      )
      .digest('hex');
    return this.customers.create(cleaned as CustomerInput, actorId, {
      key: 'customer.create:' + actorId + ':' + operationKey,
      fingerprint,
    });
  }
  async update(id: string, input: Partial<CustomerInput>, actorId: string) {
    await this.get(id);
    const cleaned = this.normalize(input);
    this.validate(cleaned);
    if (input.name !== undefined && !cleaned.name)
      throw new BadRequestException('Le nom du client est obligatoire.');
    return this.customers.update(id, cleaned, actorId);
  }
  private validate(input: Partial<CustomerInput>): void {
    const limits: Array<[keyof CustomerInput, number]> = [
      ['name', 180],
      ['taxId', 100],
      ['phone', 50],
      ['email', 254],
      ['address', 500],
    ];
    for (const [field, limit] of limits) {
      const value = input[field];
      if (typeof value === 'string' && value.length > limit)
        throw new BadRequestException(`Le champ ${field} dépasse ${limit} caractères.`);
    }
  }

  private normalize<T extends Partial<CustomerInput>>(input: T): T {
    const result: Partial<CustomerInput> = {};
    if (input.name !== undefined)
      result.name = typeof input.name === 'string' ? input.name.trim() : undefined;
    for (const key of ['taxId', 'phone', 'email', 'address'] as const) {
      const value = input[key];
      if (value !== undefined) result[key] = typeof value === 'string' ? value.trim() || null : value;
    }
    if (typeof result.email === 'string') result.email = result.email.toLowerCase();
    return result as T;
  }
}
