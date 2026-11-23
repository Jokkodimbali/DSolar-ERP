import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditRepository } from './audit.repository';

describe('AuditRepository', () => {
  const user = { findUnique: jest.fn() };
  const auditLog = { findMany: jest.fn() };
  const repository = new AuditRepository({ user, auditLog } as unknown as PrismaService);
  beforeEach(() => jest.clearAllMocks());

  it('interdit la lecture aux magasiniers', async () => {
    user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [] });
    await expect(repository.list('actor', { limit: 10 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditLog.findMany).not.toHaveBeenCalled();
  });

  it('retourne une pagination stable sans exposer le payload', async () => {
    user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [{ roleId: 'role' }] });
    auditLog.findMany.mockResolvedValue([
      { id: '3', action: 'A' }, { id: '2', action: 'B' }, { id: '1', action: 'C' },
    ]);
    const page = await repository.list('actor', { limit: 2 });
    expect(page).toEqual({
      items: [{ id: '3', action: 'A' }, { id: '2', action: 'B' }],
      nextCursor: '2',
    });
    expect(auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 3,
      select: expect.not.objectContaining({ payload: true }),
    }));
  });
});
