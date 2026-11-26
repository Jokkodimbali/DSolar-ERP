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
    await service.create({ name: ' Client Test ', email: ' TEST@EXAMPLE.COM ' }, 'actor');
    expect(repository.create).toHaveBeenCalledWith({ name: 'Client Test', email: 'test@example.com' }, 'actor');
  });
  it('conserve la clé de création et une empreinte déterministe', async () => {
    await service.create({ name: ' Client ', email: ' TEST@EXAMPLE.COM ' }, 'actor', 'operation');
    await service.create({ name: 'Client', email: 'test@example.com' }, 'actor', 'operation');
    expect(repository.create).toHaveBeenNthCalledWith(
      1,
      { name: 'Client', email: 'test@example.com' },
      'actor',
      { key: 'customer.create:actor:operation', fingerprint: expect.any(String) },
    );
    expect(repository.create.mock.calls[0]?.[2]).toEqual(repository.create.mock.calls[1]?.[2]);
  });
  it('permet de supprimer une coordonnée sans effacer les autres', async () => {
    repository.find.mockResolvedValue({ id: '1', name: 'Client', createdAt: new Date() });
    await service.update('1', { email: null, phone: '  ' }, 'actor');
    expect(repository.update).toHaveBeenCalledWith('1', { email: null, phone: null }, 'actor');
  });
  it('refuse un nom vide', async () => {
    await expect(service.create({ name: '   ' }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse un nom dépassant 180 caractères', async () => {
    await expect(service.create({ name: 'A'.repeat(181) }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('refuse un email dépassant 254 caractères', async () => {
    await expect(service.create({ name: 'Client', email: 'a'.repeat(255) }, 'actor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('refuse une adresse trop longue à la modification', async () => {
    repository.find.mockResolvedValue({ id: '1', name: 'Client', createdAt: new Date() });
    await expect(service.update('1', { address: 'a'.repeat(501) }, 'actor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('retourne 404 si le client est absent', async () => {
    repository.find.mockResolvedValue(null);
    await expect(service.get('absent')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('refuse un nom vide à la modification', async () => {
    repository.find.mockResolvedValue({ id: '1', name: 'Client', createdAt: new Date() });
    await expect(service.update('1', { name: ' ' }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
  });
});
