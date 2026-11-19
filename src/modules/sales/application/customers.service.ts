import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CUSTOMERS_REPOSITORY, CustomerInput, CustomersRepository } from './customers.port';

@Injectable()
export class CustomersService {
  constructor(@Inject(CUSTOMERS_REPOSITORY) private readonly customers: CustomersRepository) {}
  list() { return this.customers.list(); }
  async get(id: string) {
    const customer = await this.customers.find(id);
    if (!customer) throw new NotFoundException('Client introuvable.');
    return customer;
  }
  async create(input: CustomerInput) {
    const cleaned = this.normalize(input);
    if (!cleaned.name) throw new BadRequestException('Le nom du client est obligatoire.');
    return this.customers.create(cleaned as CustomerInput);
  }
  async update(id: string, input: Partial<CustomerInput>) {
    await this.get(id);
    const cleaned = this.normalize(input);
    if (input.name !== undefined && !cleaned.name)
      throw new BadRequestException('Le nom du client est obligatoire.');
    return this.customers.update(id, cleaned);
  }
  private normalize<T extends Partial<CustomerInput>>(input: T): T {
    const result: Partial<CustomerInput> = {};
    for (const key of ['name', 'taxId', 'phone', 'email', 'address'] as const) {
      if (input[key] !== undefined) {
        result[key] = typeof input[key] === 'string' ? input[key].trim() : (input[key] ?? undefined);
      }
    }
    if (typeof result.email === 'string') result.email = result.email.toLowerCase();
    return result as T;
  }
}
