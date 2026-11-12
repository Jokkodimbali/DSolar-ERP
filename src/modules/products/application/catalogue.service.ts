import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CATALOGUE_REPOSITORY, CatalogueRepository, ReferenceKind } from './catalogue.repository';
import { PRODUCT_REPOSITORY, ProductRepository } from './product.repository';
@Injectable()
export class CatalogueService {
  constructor(
    @Inject(CATALOGUE_REPOSITORY) private readonly catalogue: CatalogueRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
  ) {}
  list(kind: ReferenceKind) {
    return this.catalogue.listReferences(kind);
  }
  async createCategory(input: { code: string; name: string; parentId?: string }) {
    const code = this.code(input.code);
    const name = this.name(input.name);
    if (input.parentId && !(await this.catalogue.findReference('category', input.parentId)))
      throw new NotFoundException('Catégorie parente introuvable.');
    return this.catalogue.createCategory({
      code,
      name,
      ...(input.parentId ? { parentId: input.parentId } : {}),
    });
  }
  createBrand(input: { name: string }) {
    return this.catalogue.createBrand({ name: this.name(input.name) });
  }
  createTaxRegime(input: { code: string; name: string; rate: string; legalBasis?: string }) {
    const rate = this.amount(input.rate, 'taux', 100);
    return this.catalogue.createTaxRegime({
      code: this.code(input.code),
      name: this.name(input.name),
      rate,
      legalBasis: input.legalBasis?.trim(),
    });
  }
  async prices(productId: string) {
    await this.ensureProduct(productId);
    return this.catalogue.listPrices(productId);
  }
  async setPrice(productId: string, input: { purchasePrice?: string; salePrice: string }) {
    await this.ensureProduct(productId);
    const salePrice = this.amount(input.salePrice, 'prix de vente', undefined, 2);
    const purchasePrice =
      input.purchasePrice === undefined
        ? undefined
        : this.amount(input.purchasePrice, 'prix d’achat', undefined, 2);
    return this.catalogue.setPrice({
      productId,
      salePrice,
      ...(purchasePrice === undefined ? {} : { purchasePrice }),
      validFrom: new Date(),
    });
  }
  private async ensureProduct(id: string) {
    if (!(await this.products.findById(id))) throw new NotFoundException('Produit introuvable.');
  }
  private name(value: string): string {
    const name = value.trim();
    if (!name || name.length > 200)
      throw new BadRequestException('Le nom doit contenir entre 1 et 200 caractères.');
    return name;
  }
  private code(value: string): string {
    const code = value.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,59}$/.test(code))
      throw new BadRequestException('Le code doit contenir entre 2 et 60 caractères autorisés.');
    return code;
  }
  private amount(value: string, label: string, max?: number, precision = 4): string {
    if (!new RegExp(`^(0|[1-9]\\d{0,14})(\\.\\d{1,${precision}})?$`).test(value))
      throw new BadRequestException(`Format invalide pour ${label}.`);
    const number = Number(value);
    if (!Number.isFinite(number) || (max !== undefined && number > max))
      throw new BadRequestException(`Valeur invalide pour ${label}.`);
    return value;
  }
}
