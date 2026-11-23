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
      activate: jest.fn(),
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
  it('refuse un nom de fournisseur dépassant 180 caractères', async () => {
    await expect(service.create({ name: 'F'.repeat(181) })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('refuse une adresse trop longue lors de la modification', async () => {
    repository.find.mockResolvedValue(supplier);
    await expect(service.update(supplier.id, { address: 'A'.repeat(501) })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.update).not.toHaveBeenCalled();
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
  it('réactive un fournisseur désactivé', async () => {
    repository.find.mockResolvedValue({ ...supplier, active: false });
    repository.activate.mockResolvedValue(supplier);
    await service.activate(supplier.id);
    expect(repository.activate).toHaveBeenCalledWith(supplier.id);
  });
  it('évite une double activation', async () => {
    repository.find.mockResolvedValue(supplier);
    await service.activate(supplier.id);
    expect(repository.activate).not.toHaveBeenCalled();
  });
  it('désactive un fournisseur actif', async () => {
    repository.find.mockResolvedValue(supplier);
    repository.deactivate.mockResolvedValue({ ...supplier, active: false });
    await service.deactivate(supplier.id);
    expect(repository.deactivate).toHaveBeenCalledWith(supplier.id);
  });
});
