import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomersRepository } from './customers.port';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  let repository: jest.Mocked<CustomersRepository>;
  let service: CustomersService;
  beforeEach(() => {
    repository = { list: jest.fn(), find: jest.fn(), create: jest.fn(), update: jest.fn() };
    service = new CustomersService(repository);
  });
  it('normalise le nom et l’email', async () => {
    await service.create({ name: ' Client Test ', email: ' TEST@EXAMPLE.COM ' });
    expect(repository.create).toHaveBeenCalledWith({ name: 'Client Test', email: 'test@example.com' });
  });
  it('refuse un nom vide', async () => {
    await expect(service.create({ name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('retourne 404 si le client est absent', async () => {
    repository.find.mockResolvedValue(null);
    await expect(service.get('absent')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('refuse un nom vide à la modification', async () => {
    repository.find.mockResolvedValue({ id: '1', name: 'Client', createdAt: new Date() });
    await expect(service.update('1', { name: ' ' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
