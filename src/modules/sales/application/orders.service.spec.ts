import { NotFoundException } from '@nestjs/common';
import { OrdersRepository } from './orders.port';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const repository = {
    list: jest.fn(),
    find: jest.fn(),
    convert: jest.fn(),
  } as jest.Mocked<OrdersRepository>;
  const service = new OrdersService(repository);

  beforeEach(() => jest.resetAllMocks());

  it('transmet le périmètre utilisateur à la liste des commandes', async () => {
    repository.list.mockResolvedValue([]);
    await service.list('actor-id');
    expect(repository.list).toHaveBeenCalledWith('actor-id');
  });

  it('refuse une commande absente ou non autorisée', async () => {
    repository.find.mockResolvedValue(null);
    await expect(service.get('order-id', 'actor-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('retourne une commande accessible', async () => {
    const order = { id: 'order-id' };
    repository.find.mockResolvedValue(order);
    await expect(service.get('order-id', 'actor-id')).resolves.toEqual(order);
  });

  it('transmet le devis et l’identité à la conversion', async () => {
    repository.convert.mockResolvedValue({ id: 'order-id' });
    await service.convert('proforma-id', 'actor-id');
    expect(repository.convert).toHaveBeenCalledWith('proforma-id', 'actor-id');
  });
});
