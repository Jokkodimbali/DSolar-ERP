import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuppliersRepository } from './suppliers.repository';
import { SuppliersService } from './suppliers.service';

// prettier-ignore
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
    await service.create({ name: ' Fournisseur A ', email: ' TEST@EXAMPLE.COM ' }, 'actor');
    expect(repository.create).toHaveBeenCalledWith(
      {
        name: 'Fournisseur A',
        email: 'test@example.com',
      },
      'actor',
    );
  });
  it('refuse un nom vide', async () => {
    await expect(service.create({ name: '   ' }, 'actor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('refuse un nom de fournisseur dépassant 180 caractères', async () => {
    await expect(service.create({ name: 'F'.repeat(181) }, 'actor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('refuse une adresse trop longue lors de la modification', async () => {
    repository.find.mockResolvedValue(supplier);
    await expect(
      service.update(supplier.id, { address: 'A'.repeat(501) }, 'actor'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('efface explicitement les coordonnées facultatives sans modifier les champs omis', async () => {
    repository.find.mockResolvedValue(supplier);
    repository.update.mockResolvedValue(supplier);
    await service.update(supplier.id, { email: null, phone: '  ', address: null }, 'actor');
    expect(repository.update).toHaveBeenCalledWith(
      supplier.id,
      { email: null, phone: null, address: null },
      'actor',
    );
  });
  it('retourne 404 si le fournisseur est absent', async () => {
    repository.find.mockResolvedValue(null);
    await expect(service.get('absent')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('évite de désactiver deux fois', async () => {
    repository.find.mockResolvedValue({ ...supplier, active: false });
    await service.deactivate(supplier.id, 'actor');
    expect(repository.deactivate).not.toHaveBeenCalled();
  });
  it('réactive un fournisseur désactivé', async () => {
    repository.find.mockResolvedValue({ ...supplier, active: false });
    repository.activate.mockResolvedValue(supplier);
    await service.activate(supplier.id, 'actor');
    expect(repository.activate).toHaveBeenCalledWith(supplier.id, 'actor');
  });
  it('évite une double activation', async () => {
    repository.find.mockResolvedValue(supplier);
    await service.activate(supplier.id, 'actor');
    expect(repository.activate).not.toHaveBeenCalled();
  });
  it('désactive un fournisseur actif', async () => {
    repository.find.mockResolvedValue(supplier);
    repository.deactivate.mockResolvedValue({ ...supplier, active: false });
    await service.deactivate(supplier.id, 'actor');
    expect(repository.deactivate).toHaveBeenCalledWith(supplier.id, 'actor');
  });
});
