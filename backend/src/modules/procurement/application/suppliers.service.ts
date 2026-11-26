import { createHash } from 'node:crypto';
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
  async create(input: SupplierInput, actorId: string, operationKey?: string) {
    const cleaned = this.normalize(input);
    this.validate(cleaned);
    if (!cleaned.name) throw new BadRequestException('Le nom du fournisseur est obligatoire.');
    if (!operationKey) return this.suppliers.create(cleaned as SupplierInput, actorId);
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
    return this.suppliers.create(cleaned as SupplierInput, actorId, {
      key: `supplier.create:${actorId}:${operationKey}`,
      fingerprint,
    });
  }
  async update(id: string, input: Partial<SupplierInput>, actorId: string) {
    await this.get(id);
    const cleaned = this.normalize(input);
    this.validate(cleaned);
    if (input.name !== undefined && !cleaned.name)
      throw new BadRequestException('Le nom du fournisseur est obligatoire.');
    return this.suppliers.update(id, cleaned, actorId);
  }
  async deactivate(id: string, actorId: string) {
    const supplier = await this.get(id);
    if (!supplier.active) return supplier;
    return this.suppliers.deactivate(id, actorId);
  }
  async activate(id: string, actorId: string) {
    const supplier = await this.get(id);
    if (supplier.active) return supplier;
    return this.suppliers.activate(id, actorId);
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
