import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { UserManagementService } from './user-management.service';
import { UserManagementRepository } from './user-management.port';
import { PasswordService } from './ports';
describe('UserManagementService', () => {
  const users: jest.Mocked<UserManagementRepository> = {
    list: jest.fn(),
    create: jest.fn(),
    disableUnlessLastAdmin: jest.fn(),
    replaceAccessUnlessLastAdmin: jest.fn(),
    rolesExist: jest.fn(),
    activeStoresExist: jest.fn(),
    emailExists: jest.fn(),
  };
  const passwords: jest.Mocked<PasswordService> = { hash: jest.fn(), verify: jest.fn() };
  const service = new UserManagementService(users, passwords);
  beforeEach(() => jest.resetAllMocks());
  it('refuse une adresse déjà utilisée', async () => {
    users.emailExists.mockResolvedValue(true);
    await expect(
      service.create({
        email: 'A@EXAMPLE.COM',
        fullName: 'Test',
        password: 'MotDePasseTresLong',
        roleCodes: ['MAGASINIER'],
        storeIds: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(users.create).not.toHaveBeenCalled();
  });
  it('refuse un rôle inconnu', async () => {
    users.emailExists.mockResolvedValue(false);
    users.rolesExist.mockResolvedValue(false);
    await expect(
      service.create({
        email: 'a@example.com',
        fullName: 'Test',
        password: 'MotDePasseTresLong',
        roleCodes: ['INCONNU'],
        storeIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse un ancien rôle même s’il existe encore en base', async () => {
    users.emailExists.mockResolvedValue(false);
    users.rolesExist.mockResolvedValue(true);
    await expect(
      service.create({
        email: 'ancien@example.com',
        fullName: 'Test',
        password: 'MotDePasseTresLong',
        roleCodes: ['COMMERCIAL'],
        storeIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.create).not.toHaveBeenCalled();
  });
  it('interdit de désactiver le dernier administrateur', async () => {
    users.disableUnlessLastAdmin.mockResolvedValue('last_admin');
    await expect(service.disable('id')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('interdit de retirer le rôle du dernier administrateur', async () => {
    users.rolesExist.mockResolvedValue(true);
    users.activeStoresExist.mockResolvedValue(true);
    users.replaceAccessUnlessLastAdmin.mockResolvedValue('last_admin');
    await expect(service.replaceAccess('id', ['MAGASINIER'], [])).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('normalise le mail et délègue au repository', async () => {
    users.emailExists.mockResolvedValue(false);
    users.rolesExist.mockResolvedValue(true);
    users.activeStoresExist.mockResolvedValue(true);
    passwords.hash.mockResolvedValue('hash');
    users.create.mockResolvedValue({
      id: 'id',
      email: 'a@example.com',
      nomComplet: 'Awa',
      permissions: [],
      magasinsAutorises: [],
    });
    await service.create({
      email: ' A@EXAMPLE.COM ',
      fullName: ' Awa ',
      password: 'MotDePasseTresLong',
      roleCodes: ['MAGASINIER'],
      storeIds: [],
    });
    expect(users.create).toHaveBeenCalledWith(
      {
        email: 'a@example.com',
        fullName: 'Awa',
        passwordHash: 'hash',
        roleCodes: ['MAGASINIER'],
        storeIds: [],
      },
      undefined,
    );
  });

  it('transmet l’identité de l’administrateur lors de la désactivation', async () => {
    users.disableUnlessLastAdmin.mockResolvedValue('disabled');
    await service.disable('user-1', 'admin-1');
    expect(users.disableUnlessLastAdmin).toHaveBeenCalledWith('user-1', 'admin-1');
  });

  it('transmet l’identité de l’administrateur lors du changement des accès', async () => {
    users.rolesExist.mockResolvedValue(true);
    users.activeStoresExist.mockResolvedValue(true);
    users.replaceAccessUnlessLastAdmin.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.sn',
      nomComplet: 'A',
      permissions: [],
      magasinsAutorises: [],
    });
    await service.replaceAccess('user-1', ['MAGASINIER'], [], 'admin-1');
    expect(users.replaceAccessUnlessLastAdmin).toHaveBeenCalledWith('user-1', ['MAGASINIER'], [], 'admin-1');
  });
});
