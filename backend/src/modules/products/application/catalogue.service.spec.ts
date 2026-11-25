import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { CatalogueRepository } from './catalogue.repository';
import { ProductRepository } from './product.repository';
const repository = (): jest.Mocked<CatalogueRepository> => ({
  listReferences: jest.fn(),
  findReference: jest.fn(),
  createCategory: jest.fn(),
  createBrand: jest.fn(),
  createTaxRegime: jest.fn(),
  renameReference: jest.fn(),
  deleteUnusedReference: jest.fn(),
  listPrices: jest.fn(),
  setPrice: jest.fn(),
});
const products = (): jest.Mocked<ProductRepository> => ({
  list: jest.fn(),
  search: jest.fn(),
  findById: jest.fn(),
  findBySku: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  setActive: jest.fn(),
});
describe('CatalogueService', () => {
  it('normalise le code et le nom de catégorie', async () => {
    const repo = repository();
    const svc = new CatalogueService(repo, products());
    await svc.createCategory({ code: ' panneaux ', name: ' Panneaux solaires ' });
    expect(repo.createCategory).toHaveBeenCalledWith({ code: 'PANNEAUX', name: 'Panneaux solaires' });
  });
  it('renomme les références sans modifier leur identité fiscale', async () => {
    const repo = repository();
    const svc = new CatalogueService(repo, products());
    await svc.renameReference('taxRegime', 'tax', ' TVA standard ');
    expect(repo.renameReference).toHaveBeenCalledWith('taxRegime', 'tax', 'TVA standard');
    expect(() => svc.renameReference('brand', 'id', '  ')).toThrow(BadRequestException);
  });

  it('délègue la suppression des références non fiscales au repository', async () => {
    const repo = repository();
    const svc = new CatalogueService(repo, products());
    await svc.deleteReference('category', 'id');
    expect(repo.deleteUnusedReference).toHaveBeenCalledWith('category', 'id');
  });

  it('refuse un taux supérieur à 100%', async () => {
    const svc = new CatalogueService(repository(), products());
    expect(() => svc.createTaxRegime({ code: 'TVA', name: 'TVA', rate: '101' })).toThrow(BadRequestException);
  });
  it('refuse de fixer le prix d’un produit inexistant', async () => {
    const svc = new CatalogueService(repository(), products());
    await expect(svc.setPrice('absent', { salePrice: '100' })).rejects.toThrow(NotFoundException);
  });
  it('refuse un prix négatif', async () => {
    const repo = repository(),
      p = products();
    p.findById.mockResolvedValue({
      id: 'id',
      sku: 'AB',
      name: 'Produit',
      description: null,
      unit: 'PIECE',
      active: true,
      categoryId: null,
      brandId: null,
      taxRegimeId: null,
      isSolarPlant: false,
    });
    const svc = new CatalogueService(repo, p);
    await expect(svc.setPrice('id', { salePrice: '-1' })).rejects.toThrow(BadRequestException);
  });
});
