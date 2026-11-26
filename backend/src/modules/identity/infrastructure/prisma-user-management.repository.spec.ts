import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaUserRepository } from './prisma-user.repository';
import { PrismaUserManagementRepository } from './prisma-user-management.repository';

describe('PrismaUserManagementRepository audit transactionnel', () => {
  const tx = {
    user: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
    role: { findMany: jest.fn() },
    store: { count: jest.fn() },
    userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
    userStoreAccess: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    user: { findMany: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const identity = { findById: jest.fn() };
  const repository = new PrismaUserManagementRepository(
    prisma as unknown as PrismaService,
    identity as unknown as PrismaUserRepository,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    tx.auditLog.create.mockResolvedValue({});
  });

  it('projette uniquement les champs administratifs et les rôles explicites', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'a@b.sn',
        fullName: 'A',
        status: 'DISABLED',
        roles: [{ role: { code: 'MAGASINIER', permissions: [{ permission: { code: 'stores.read' } }] } }],
        stores: [{ storeId: 'store-1' }],
      },
    ]);
    expect(await repository.list()).toEqual([
      {
        id: 'user-1',
        email: 'a@b.sn',
        nomComplet: 'A',
        status: 'DISABLED',
        roleCodes: ['MAGASINIER'],
        permissions: ['stores.read'],
        magasinsAutorises: ['store-1'],
      },
    ]);
    expect(prisma.user.findMany.mock.calls[0][0].select).not.toHaveProperty('passwordHash');
    expect(identity.findById).not.toHaveBeenCalled();
  });

  it('journalise une création sans enregistrer le mot de passe', async () => {
    tx.user.create.mockResolvedValue({ id: 'user-1' });
    identity.findById.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.sn',
      fullName: 'A',
      permissions: [],
      storeIds: [],
    });
    await repository.create(
      {
        email: 'a@b.sn',
        fullName: 'A',
        passwordHash: 'secret-hash',
        roleCodes: ['MAGASINIER'],
        storeIds: [],
      },
      'admin-1',
    );
    const log = tx.auditLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ actorId: 'admin-1', action: 'USER_CREATED', entityId: 'user-1' });
    expect(JSON.stringify(log)).not.toContain('secret-hash');
  });

  it('ne journalise pas une désactivation déjà effectuée', async () => {
    tx.user.findUnique.mockResolvedValue({ status: 'DISABLED', roles: [] });
    await expect(repository.disableUnlessLastAdmin('user-1', 'admin-1')).resolves.toBe('disabled');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('journalise la désactivation effective', async () => {
    tx.user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [] });
    tx.user.update.mockResolvedValue({});
    await repository.disableUnlessLastAdmin('user-1', 'admin-1');
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'USER_DISABLED',
        actorId: 'admin-1',
      }),
    });
  });

  it('ne révoque pas les sessions lorsque les accès restent identiques', async () => {
    tx.user.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      roles: [{ role: { code: 'MAGASINIER' } }],
    });
    tx.role.findMany.mockResolvedValue([{ id: 'role-1' }]);
    tx.store.count.mockResolvedValue(0);
    tx.userStoreAccess.findMany.mockResolvedValue([]);
    identity.findById.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.sn',
      fullName: 'A',
      permissions: [],
      storeIds: [],
    });
    await repository.replaceAccessUnlessLastAdmin('user-1', ['MAGASINIER'], [], 'admin-1');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
