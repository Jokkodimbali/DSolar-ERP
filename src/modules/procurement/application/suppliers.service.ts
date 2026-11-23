import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SUPPLIERS_REPOSITORY, SupplierInput, SuppliersRepository } from './suppliers.repository';

@Injectable()
export class SuppliersService {
  constructor(@Inject(SUPPLIERS_REPOSITORY) private readonly suppliers: SuppliersRepository) {}
  list() {
    return this.suppliers.list();
  }
  async get(id: string) {
    const supplier = await this.suppliers.find(id);
    if (!supplier) throw new NotFoundException('Fournisseur introuvable.');
    return supplier;
  }
  async create(input: SupplierInput) {
    const cleaned = this.normalize(input);
    this.validate(cleaned);
    if (!cleaned.name) throw new BadRequestException('Le nom du fournisseur est obligatoire.');
    return this.suppliers.create(cleaned as SupplierInput);
  }
  async update(id: string, input: Partial<SupplierInput>) {
    await this.get(id);
    const cleaned = this.normalize(input);
    this.validate(cleaned);
    if (input.name !== undefined && !cleaned.name)
      throw new BadRequestException('Le nom du fournisseur est obligatoire.');
    return this.suppliers.update(id, cleaned);
  }
  async deactivate(id: string) {
    const supplier = await this.get(id);
    if (!supplier.active) return supplier;
    return this.suppliers.deactivate(id);
  }
  async activate(id: string) {
    const supplier = await this.get(id);
    if (supplier.active) return supplier;
    return this.suppliers.activate(id);
  }
  private validate(input: Partial<SupplierInput>): void {
    const limits: Array<[keyof SupplierInput, number]> = [
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

  private normalize<T extends Partial<SupplierInput>>(input: T): T {
    const result: Partial<SupplierInput> = {};
    for (const key of ['name', 'taxId', 'phone', 'email', 'address'] as const) {
      if (input[key] !== undefined)
        result[key] = typeof input[key] === 'string' ? input[key].trim() : (input[key] ?? undefined);
    }
    if (typeof result.email === 'string') result.email = result.email.toLowerCase();
    return result as T;
  }
}
