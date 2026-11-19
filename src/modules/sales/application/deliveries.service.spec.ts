import { NotFoundException } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesRepository } from './deliveries.port';

describe('DeliveriesService', () => {
  const repository: jest.Mocked<DeliveriesRepository> = {
    list: jest.fn(),
    create: jest.fn(),
    confirm: jest.fn(),
    cancel: jest.fn(),
    find: jest.fn(),
  };
  const service = new DeliveriesService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('filtre les livraisons par commande et utilisateur', async () => {
    repository.list.mockResolvedValue([]);
    await expect(service.list('order-id', 'actor-id')).resolves.toEqual([]);
    expect(repository.list).toHaveBeenCalledWith('order-id', 'actor-id');
  });

  it('retourne une livraison accessible', async () => {
    repository.find.mockResolvedValue({ id: 'delivery-id' });
    await expect(service.get('order-id', 'delivery-id', 'actor-id')).resolves.toEqual({
      id: 'delivery-id',
    });
  });

  it('masque les livraisons absentes ou non autorisées', async () => {
    repository.find.mockResolvedValue(null);
    await expect(service.get('order-id', 'delivery-id', 'actor-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
