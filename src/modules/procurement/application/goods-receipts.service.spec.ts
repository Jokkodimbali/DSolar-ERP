import { BadRequestException } from '@nestjs/common';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptsRepository } from './goods-receipts.port';

describe('GoodsReceiptsService', () => {
  const repository = {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    confirm: jest.fn(),
    cancel: jest.fn(),
  } as jest.Mocked<GoodsReceiptsRepository>;
  const service = new GoodsReceiptsService(repository);
  const base = {
    number: ' REC-001 ',
    purchaseOrderId: 'order-id',
    storeId: 'store-id',
    lines: [{ productId: 'product-id', quantity: 2, unitCost: 100 }],
  };
  beforeEach(() => jest.clearAllMocks());
  it('délègue l’annulation avec l’identité de l’acteur', async () => {
    await service.cancel('receipt-id', 'actor');
    expect(repository.cancel).toHaveBeenCalledWith('receipt-id', 'actor');
  });
  it('normalise le numéro de réception', async () => {
    await service.create(base, 'actor');
    expect(repository.create).toHaveBeenCalledWith({ ...base, number: 'REC-001' }, 'actor');
  });
  it('refuse une réception vide', async () => {
    await expect(service.create({ ...base, lines: [] }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse un produit en double', async () => {
    await expect(
      service.create({ ...base, lines: [base.lines[0], base.lines[0]] }, 'actor'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse une quantité avec plus de trois décimales', async () => {
    await expect(
      service.create({ ...base, lines: [{ ...base.lines[0], quantity: 1.0001 }] }, 'actor'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse un coût avec plus de deux décimales', async () => {
    await expect(
      service.create({ ...base, lines: [{ ...base.lines[0], unitCost: 1.001 }] }, 'actor'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse une réception avec plus de cent lignes', async () => {
    const lines = Array.from({ length: 101 }, (_, index) => ({
      productId: String(index),
      quantity: 1,
      unitCost: 1,
    }));
    await expect(service.create({ ...base, lines }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse une quantité négative', async () => {
    await expect(
      service.create(
        {
          ...base,
          lines: [{ ...base.lines[0], quantity: -1 }],
        },
        'actor',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
