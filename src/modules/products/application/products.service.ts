import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProduct, UpdateProduct } from '../domain/product';
import { PRODUCT_REPOSITORY, ProductRepository } from './product.repository';
@Injectable()
export class ProductsService {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly repository: ProductRepository) {}
  list(active?: boolean) {
    return this.repository.list(active);
  }
  async get(id: string) {
    const product = await this.repository.findById(id);
    if (!product) throw new NotFoundException('Produit introuvable.');
    return product;
  }
  async create(input: CreateProduct) {
    const sku = input.sku.trim().toUpperCase();
    const name = input.name.trim();
    if (!/^[A-Z0-9][A-Z0-9._-]{1,79}$/.test(sku))
      throw new BadRequestException('Le SKU doit contenir entre 2 et 80 caractères autorisés.');
    if (!name) throw new BadRequestException('Le nom du produit est obligatoire.');
    if (await this.repository.findBySku(sku)) throw new ConflictException('Ce SKU existe déjà.');
    return this.repository.create({ ...input, sku, name, unit: input.unit?.trim().toUpperCase() || 'PIECE' });
  }
  async update(id: string, input: UpdateProduct) {
    await this.get(id);
    const name = input.name?.trim();
    if (input.name !== undefined && !name)
      throw new BadRequestException('Le nom du produit est obligatoire.');
    const unit = input.unit?.trim().toUpperCase();
    if (input.unit !== undefined && !unit)
      throw new BadRequestException('L’unité du produit est obligatoire.');
    return this.repository.update(id, {
      ...input,
      ...(name !== undefined ? { name } : {}),
      ...(unit !== undefined ? { unit } : {}),
    });
  }
  async setActive(id: string, active: boolean) {
    const product = await this.get(id);
    return product.active === active ? product : this.repository.setActive(id, active);
  }
}
