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
  create(input: SupplierInput) {
    const cleaned = this.normalize(input);
    if (!cleaned.name) throw new BadRequestException('Le nom du fournisseur est obligatoire.');
    return this.suppliers.create(cleaned as SupplierInput);
  }
  async update(id: string, input: Partial<SupplierInput>) {
    await this.get(id);
    const cleaned = this.normalize(input);
    if (input.name !== undefined && !cleaned.name)
      throw new BadRequestException('Le nom du fournisseur est obligatoire.');
    return this.suppliers.update(id, cleaned);
  }
  async deactivate(id: string) {
    const supplier = await this.get(id);
    if (!supplier.active) return supplier;
    return this.suppliers.deactivate(id);
  }
  private normalize<T extends Partial<SupplierInput>>(input: T): T {
    const result: Partial<SupplierInput> = {};
    for (const key of ['name', 'taxId', 'phone', 'email', 'address'] as const) {
      if (input[key] !== undefined)
        result[key] = typeof input[key] === 'string' ? input[key].trim() : input[key];
    }
    if (typeof result.email === 'string') result.email = result.email.toLowerCase();
    return result as T;
  }
}
