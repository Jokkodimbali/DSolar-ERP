import { ConflictException, NotFoundException } from '@nestjs/common';
import { StoreAccessUseCases } from './store-access.use-cases';
import { StoreRepository } from './store.repository';
import { StoreAccessRepository } from './store-access.repository';
describe('StoreAccessUseCases', () => {
  const store = {
    id: 's',
    code: 'M1',
    name: 'Magasin',
    address: null,
    status: 'ACTIVE' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let stores: jest.Mocked<StoreRepository>;
  let access: jest.Mocked<StoreAccessRepository>;
  let service: StoreAccessUseCases;
  beforeEach(() => {
    stores = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setStatus: jest.fn(),
    };
    access = {
      userExists: jest.fn(),
      hasAccess: jest.fn(),
      grant: jest.fn(),
      revoke: jest.fn(),
      listStoreIds: jest.fn(),
    };
    service = new StoreAccessUseCases(stores, access);
  });
  it('refuse un magasin inconnu', async () => {
    stores.findById.mockResolvedValue(null);
    await expect(service.grant('s', 'u')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('refuse un magasin désactivé', async () => {
    stores.findById.mockResolvedValue({ ...store, status: 'INACTIVE' });
    await expect(service.grant('s', 'u')).rejects.toBeInstanceOf(ConflictException);
  });
  it('refuse un utilisateur inexistant', async () => {
    stores.findById.mockResolvedValue(store);
    access.userExists.mockResolvedValue(false);
    await expect(service.grant('s', 'u')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('attribue un accès valide', async () => {
    stores.findById.mockResolvedValue(store);
    access.userExists.mockResolvedValue(true);
    await expect(service.grant('s', 'u')).resolves.toEqual({ storeId: 's', userId: 'u', assigned: true });
    expect(access.grant).toHaveBeenCalledWith('u', 's');
  });
  it('retourne seulement les magasins actifs autorisés', async () => {
    stores.findAll.mockResolvedValue([
      store,
      { ...store, id: 's2', status: 'INACTIVE' },
      { ...store, id: 's3' },
    ]);
    access.listStoreIds.mockResolvedValue(['s', 's2']);
    await expect(service.listForUser('u')).resolves.toEqual([store]);
  });
});
