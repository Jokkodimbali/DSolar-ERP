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
  it('refuse un numéro de réception dépassant cent caractères', async () => {
    await expect(service.create({ ...base, number: 'R'.repeat(101) }, 'actor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.create).not.toHaveBeenCalled();
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
  // prettier-ignore
  it('refuse un numéro de réception vide après normalisation', async () => {
    await expect(service.create({ ...base, number: '   ' }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });
  // prettier-ignore
  it('refuse un coût négatif sans appeler le dépôt', async () => {
    await expect(
      service.create({ ...base, lines: [{ ...base.lines[0], unitCost: -1 }] }, 'actor'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });
  // prettier-ignore
  it('refuse une quantité nulle sans appeler le dépôt', async () => {
    await expect(
      service.create({ ...base, lines: [{ ...base.lines[0], quantity: 0 }] }, 'actor'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });
  // prettier-ignore
  it('transmet l’identité de l’acteur lors de la confirmation', async () => {
    await service.confirm('receipt-id', 'actor');
    expect(repository.confirm).toHaveBeenCalledWith('receipt-id', 'actor');
  });
  // prettier-ignore
  it('délègue la consultation et la liste avec l’identité de l’acteur', async () => {
    await service.list('actor');
    await service.get('receipt-id', 'actor');
    expect(repository.list).toHaveBeenCalledWith('actor');
    expect(repository.get).toHaveBeenCalledWith('receipt-id', 'actor');
  });
  // prettier-ignore
  it('accepte la précision maximale des quantités et des coûts', async () => {
    const input = {
      ...base,
      lines: [{ ...base.lines[0], quantity: 0.001, unitCost: 0.01 }],
    };
    await service.create(input, 'actor');
    expect(repository.create).toHaveBeenCalledWith({ ...input, number: 'REC-001' }, 'actor');
  });
  // prettier-ignore
  it.each([NaN, Infinity, -Infinity])(
    'refuse une quantité non finie (%s)',
    async (quantity) => {
      await expect(
        service.create({ ...base, lines: [{ ...base.lines[0], quantity }] }, 'actor'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    },
  );
  it.each([NaN, Infinity, -Infinity])(
    'refuse un coût non fini (%s)',
    async (unitCost) => {
      await expect(
        service.create({ ...base, lines: [{ ...base.lines[0], unitCost }] }, 'actor'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    },
  );
  // prettier-ignore
  it('accepte exactement cent lignes distinctes', async () => {
    const input = {
      ...base,
      lines: Array.from({ length: 100 }, (_, index) => ({
        productId: String(index),
        quantity: 1,
        unitCost: 1,
      })),
    };
    await service.create(input, 'actor');
    expect(repository.create).toHaveBeenCalledWith({ ...input, number: 'REC-001' }, 'actor');
  });

});
