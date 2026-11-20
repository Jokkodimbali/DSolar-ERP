import { BadRequestException, ConflictException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersRepository } from './purchase-orders.repository';

describe('PurchaseOrdersService', () => {
  let repository: jest.Mocked<
    Pick<PurchaseOrdersRepository, 'create' | 'find' | 'confirm' | 'cancel' | 'list'>
  >;
  let service: PurchaseOrdersService;
  beforeEach(() => {
    repository = {
      create: jest.fn(),
      find: jest.fn(),
      confirm: jest.fn(),
      cancel: jest.fn(),
      list: jest.fn(),
    };
    service = new PurchaseOrdersService(repository as unknown as PurchaseOrdersRepository);
  });
  const input = {
    number: 'CMD-001',
    supplierId: 'supplier-id',
    lines: [{ productId: 'product-id', quantity: 2, unitCost: 1000 }],
  };
  it('refuse une commande sans lignes', async () => {
    await expect(service.create({ ...input, lines: [] })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse les produits en double', async () => {
    await expect(
      service.create({ ...input, lines: [input.lines[0], input.lines[0]] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse les quantités négatives', async () => {
    await expect(
      service.create({ ...input, lines: [{ ...input.lines[0], quantity: -1 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse les quantités avec plus de trois décimales', async () => {
    await expect(
      service.create({ ...input, lines: [{ ...input.lines[0], quantity: 1.0001 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse les coûts avec plus de deux décimales', async () => {
    await expect(
      service.create({ ...input, lines: [{ ...input.lines[0], unitCost: 10.001 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse plus de cent lignes', async () => {
    const lines = Array.from({ length: 101 }, (_, index) => ({
      productId: String(index),
      quantity: 1,
      unitCost: 10,
    }));
    await expect(service.create({ ...input, lines })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('normalise le numéro', async () => {
    await service.create({ ...input, number: ' cmd-001 ' });
    expect(repository.create).toHaveBeenCalledWith({ ...input, number: 'CMD-001' });
  });
  it('refuse la confirmation d’une commande déjà confirmée', async () => {
    repository.find.mockResolvedValue({ id: '1', status: 'CONFIRMED' } as never);
    await expect(service.confirm('1')).rejects.toBeInstanceOf(ConflictException);
  });
  it('autorise l’annulation d’une commande brouillon', async () => {
    repository.find.mockResolvedValue({ id: '1', status: 'DRAFT' } as never);
    await service.cancel('1');
    expect(repository.cancel).toHaveBeenCalledWith('1');
  });
  it('refuse l’annulation d’une commande confirmée', async () => {
    repository.find.mockResolvedValue({ id: '1', status: 'CONFIRMED' } as never);
    await expect(service.cancel('1')).rejects.toBeInstanceOf(ConflictException);
    expect(repository.cancel).not.toHaveBeenCalled();
  });
});
