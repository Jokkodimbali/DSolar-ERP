import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StoreRepository } from './store.repository';
import { StoresUseCases } from './stores.use-cases';
describe('StoresUseCases', () => {
  const store = {
    id: '1',
    code: 'MAG-001',
    name: 'Principal',
    address: null,
    status: 'ACTIVE' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let repo: jest.Mocked<StoreRepository>;
  let service: StoresUseCases;
  beforeEach(() => {
    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setStatus: jest.fn(),
    };
    service = new StoresUseCases(repo);
  });
  it('normalise le code et le nom', async () => {
    repo.findByCode.mockResolvedValue(null);
    repo.create.mockResolvedValue(store);
    await service.create({ code: ' mag-001 ', name: ' Principal ' });
    expect(repo.create).toHaveBeenCalledWith({ code: 'MAG-001', name: 'Principal', address: undefined });
  });
  it('refuse un doublon', async () => {
    repo.findByCode.mockResolvedValue(store);
    await expect(service.create({ code: 'MAG-001', name: 'Principal' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('refuse les valeurs vides après normalisation', async () => {
    await expect(service.create({ code: ' ', name: 'Principal' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it('retourne 404 pour un magasin absent', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.get('absent')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('ne modifie pas un statut déjà identique', async () => {
    repo.findById.mockResolvedValue(store);
    await service.setStatus('1', 'ACTIVE');
    expect(repo.setStatus).not.toHaveBeenCalled();
  });
  it('désactive un magasin actif', async () => {
    repo.findById.mockResolvedValue(store);
    repo.setStatus.mockResolvedValue({ ...store, status: 'INACTIVE' });
    await service.setStatus('1', 'INACTIVE');
    expect(repo.setStatus).toHaveBeenCalledWith('1', 'INACTIVE');
  });
  it('refuse de vider le nom', async () => {
    repo.findById.mockResolvedValue(store);
    await expect(service.update('1', { name: '  ' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
