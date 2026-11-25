import { BadRequestException } from '@nestjs/common';
import { StockCountRepository } from './stock-count.port';
import { StockCountService } from './stock-count.service';

describe('StockCountService', () => {
  const repository: StockCountRepository = {
    list: jest.fn(),
    start: jest.fn(),
    get: jest.fn(),
    record: jest.fn(),
    validate: jest.fn(),
    cancel: jest.fn(),
  };
  const service = new StockCountService(repository);
  const line = { productId: 'product-id', counted: '12.500', reason: 'Inventaire physique' };

  beforeEach(() => jest.clearAllMocks());

  it('démarre une session de comptage', async () => {
    await service.start('store-id', 'actor-id');
    expect(repository.start).toHaveBeenCalledWith('store-id', 'actor-id');
  });

  it('refuse les produits dupliqués', () => {
    expect(() => service.record('id', 'actor', [line, line])).toThrow(BadRequestException);
  });

  it('refuse les quantités négatives', () => {
    expect(() => service.record('id', 'actor', [{ ...line, counted: '-1' }])).toThrow(BadRequestException);
  });

  it('refuse plus de trois décimales', () => {
    expect(() => service.record('id', 'actor', [{ ...line, counted: '1.0001' }])).toThrow(
      BadRequestException,
    );
  });

  it('accepte une quantité nulle et délègue le comptage', async () => {
    const lines = [{ ...line, counted: '0' }];
    await service.record('id', 'actor', lines);
    expect(repository.record).toHaveBeenCalledWith('id', 'actor', lines);
  });

  it('accepte une quantité fractionnaire valide', async () => {
    const lines = [{ ...line, counted: '12.500' }];
    await service.record('id', 'actor', lines);
    expect(repository.record).toHaveBeenCalledWith('id', 'actor', lines);
  });

  it('refuse les quantités avec notation scientifique', () => {
    expect(() => service.record('id', 'actor', [{ ...line, counted: '1e3' }])).toThrow(BadRequestException);
  });

  it('délègue l’annulation', async () => {
    await service.cancel('id', 'actor');
    expect(repository.cancel).toHaveBeenCalledWith('id', 'actor');
  });

  it('délègue la validation', async () => {
    await service.validate('id', 'actor');
    expect(repository.validate).toHaveBeenCalledWith('id', 'actor');
  });
});
