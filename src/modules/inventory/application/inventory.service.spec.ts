import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.port';
describe('InventoryService', () => {
  const repository: InventoryRepository = {
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
});
