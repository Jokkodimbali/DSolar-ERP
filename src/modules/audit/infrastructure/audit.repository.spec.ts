import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditRepository } from './audit.repository';

describe('AuditRepository', () => {
  const user = { findUnique: jest.fn() };
  const auditLog = { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), groupBy: jest.fn() };
  const repository = new AuditRepository({ user, auditLog } as unknown as PrismaService);
  beforeEach(() => jest.clearAllMocks());

  it('interdit la lecture aux magasiniers', async () => {
    user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [] });
    await expect(repository.list('actor', { limit: 10 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditLog.findMany).not.toHaveBeenCalled();
  });

  it('rejette un curseur inexistant dans les filtres courants', async () => {
    user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [{ roleId: 'role' }] });
    auditLog.findFirst.mockResolvedValue(null);
    await expect(
      repository.list('actor', { limit: 10, cursor: 'missing', action: 'CREATE' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(auditLog.findMany).not.toHaveBeenCalled();
  });

  it('filtre les dates avec une borne supérieure exclusive', async () => {
    user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [{ roleId: 'role' }] });
    auditLog.findMany.mockResolvedValue([]);
    await repository.list('actor', { limit: 10, from: new Date('2026-01-01'), to: new Date('2026-01-31') });
    expect(auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdAt: { gte: new Date('2026-01-01'), lt: new Date('2026-02-01') } },
      }),
    );
  });

  it('agrège la synthèse des événements avec les filtres appliqués', async () => {
    user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [{ roleId: 'role' }] });
    auditLog.count.mockResolvedValue(3);
    auditLog.groupBy
      .mockResolvedValueOnce([{ action: 'CREATE', _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ entityType: 'Store', _count: { _all: 3 } }]);
    const result = await repository.summary('admin', { limit: 1, actorId: 'user' });
    expect(result).toEqual({
      total: 3,
      byAction: [{ action: 'CREATE', count: 3 }],
      byEntityType: [{ entityType: 'Store', count: 3 }],
    });
    expect(auditLog.count).toHaveBeenCalledWith({ where: { actorId: 'user' } });
  });

  it('retourne une pagination stable sans exposer le payload', async () => {
    user.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: [{ roleId: 'role' }] });
    auditLog.findMany.mockResolvedValue([
      { id: '3', action: 'A' },
      { id: '2', action: 'B' },
      { id: '1', action: 'C' },
    ]);
    const page = await repository.list('actor', { limit: 2 });
    expect(page).toEqual({
      items: [
        { id: '3', action: 'A' },
        { id: '2', action: 'B' },
      ],
      nextCursor: '2',
    });
    expect(auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        select: expect.not.objectContaining({ payload: true }),
      }),
    );
  });
});
