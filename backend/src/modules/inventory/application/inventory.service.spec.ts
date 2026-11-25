import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.port';
describe('InventoryService', () => {
  const repository: InventoryRepository = {
    movements: jest.fn(),
    listStoreStock: jest.fn(),
    getBalance: jest.fn(),
    adjust: jest.fn(),
  };
  const service = new InventoryService(repository);
  const valid = {
    storeId: 's',
    productId: 'p',
    actorId: 'u',
    quantity: '2.500',
    direction: 'IN' as const,
    reason: 'Correction inventaire',
    operationKey: 'k',
  };
  it('délègue la recherche des mouvements avec le magasin et l’acteur', () => {
    service.movements('store-id', 'actor-id', { page: 2, limit: 10, search: 'PV' });
    expect(repository.movements).toHaveBeenCalledWith('store-id', 'actor-id', { page: 2, limit: 10, search: 'PV' });
  });
  it('délègue la consultation du stock du magasin', async () => {
    await service.listStoreStock('store-id', 'actor-id');
    expect(repository.listStoreStock).toHaveBeenCalledWith('store-id', 'actor-id');
  });
  it('refuse les quantités négatives', async () => {
    expect(() => service.adjust({ ...valid, quantity: '-1' })).toThrow(BadRequestException);
  });
  it('refuse plus de trois décimales', async () => {
    expect(() => service.adjust({ ...valid, quantity: '1.0001' })).toThrow(BadRequestException);
  });
  it('refuse une justification trop courte', async () => {
    expect(() => service.adjust({ ...valid, reason: 'abc' })).toThrow(BadRequestException);
  });
  it('délègue une commande valide au repository', async () => {
    await service.adjust(valid);
    expect(repository.adjust).toHaveBeenCalledWith(valid);
  });
  it('classe les stocks faibles et les ruptures par magasin', async () => {
    const stock = repository.listStoreStock as jest.Mock;
    stock.mockResolvedValueOnce([
      { storeId: 's', productId: 'p1', quantity: '5.000', reserved: '1.000', available: '4.000' },
      { storeId: 's', productId: 'p2', quantity: '0.000', reserved: '0.000', available: '0.000' },
      { storeId: 's', productId: 'p3', quantity: '12.000', reserved: '0.000', available: '12.000' },
    ]);
    const result = await service.stockAlerts('s', 'u', '5');
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.severity)).toEqual(['LOW_STOCK', 'OUT_OF_STOCK']);
    expect(stock).toHaveBeenCalledWith('s', 'u');
  });
  it('refuse un seuil de stock malformé avant la lecture', async () => {
    await expect(service.stockAlerts('s', 'u', '-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.stockAlerts('s', 'u', '1.0001')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('agrège les quantités, réservations et ruptures pour le tableau de bord', async () => {
    const stock = repository.listStoreStock as jest.Mock;
    stock.mockResolvedValueOnce([
      { quantity: '12.500', reserved: '2.250', available: '10.250' },
      { quantity: '0.000', reserved: '0.000', available: '0.000' },
      { quantity: '3.125', reserved: '1.125', available: '2.000' },
    ]);
    await expect(service.stockSummary('s', 'u')).resolves.toEqual({
      storeId: 's',
      products: 3,
      outOfStock: 1,
      totalQuantity: '15.625',
      totalReserved: '3.375',
      totalAvailable: '12.250',
    });
    expect(stock).toHaveBeenCalledWith('s', 'u');
  });
  it('préserve les fractions négatives dans les agrégats de stock', async () => {
    (repository.listStoreStock as jest.Mock).mockResolvedValueOnce([
      { quantity: '2.000', reserved: '0.000', available: '2.000' },
      { quantity: '-0.250', reserved: '0.000', available: '-0.250' },
    ]);
    await expect(service.stockSummary('s', 'u')).resolves.toMatchObject({
      totalQuantity: '1.750',
      totalAvailable: '1.750',
      outOfStock: 1,
    });
  });

  it('signale les disponibilités fractionnaires négatives comme ruptures', async () => {
    (repository.listStoreStock as jest.Mock).mockResolvedValueOnce([
      { productId: 'p1', quantity: '0.000', reserved: '0.250', available: '-0.250' },
      { productId: 'p2', quantity: '1.000', reserved: '0.000', available: '1.000' },
    ]);
    const result = await service.stockAlerts('s', 'u', '0');
    expect(result.items.map((item) => [item.productId, item.severity])).toEqual([['p1', 'OUT_OF_STOCK']]);
  });

  it('renvoie des totaux nuls pour un magasin sans stock', async () => {
    (repository.listStoreStock as jest.Mock).mockResolvedValueOnce([]);
    await expect(service.stockSummary('s', 'u')).resolves.toEqual({
      storeId: 's',
      products: 0,
      outOfStock: 0,
      totalQuantity: '0.000',
      totalReserved: '0.000',
      totalAvailable: '0.000',
    });
  });
});
