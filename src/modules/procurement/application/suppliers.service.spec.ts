import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuppliersRepository } from './suppliers.repository';
import { SuppliersService } from './suppliers.service';

describe('SuppliersService', () => {
  let repository: jest.Mocked<SuppliersRepository>;
  let service: SuppliersService;
  const supplier = { id: 'supplier-id', name: 'Fournisseur A', active: true };
  beforeEach(() => {
    repository = {
      list: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
    };
    service = new SuppliersService(repository);
  });
  it('normalise les coordonnées à la création', async () => {
    repository.create.mockResolvedValue(supplier);
    await service.create({ name: ' Fournisseur A ', email: ' TEST@EXAMPLE.COM ' });
    expect(repository.create).toHaveBeenCalledWith({
      name: 'Fournisseur A',
      email: 'test@example.com',
    });
  });
  it('refuse un nom vide', async () => {
    await expect(service.create({ name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('retourne 404 si le fournisseur est absent', async () => {
    repository.find.mockResolvedValue(null);
    await expect(service.get('absent')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('évite de désactiver deux fois', async () => {
    repository.find.mockResolvedValue({ ...supplier, active: false });
    await service.deactivate(supplier.id);
    expect(repository.deactivate).not.toHaveBeenCalled();
  });
  it('désactive un fournisseur actif', async () => {
    repository.find.mockResolvedValue(supplier);
    repository.deactivate.mockResolvedValue({ ...supplier, active: false });
    await service.deactivate(supplier.id);
    expect(repository.deactivate).toHaveBeenCalledWith(supplier.id);
  });
});
