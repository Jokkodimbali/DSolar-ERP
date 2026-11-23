import { BadRequestException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditRepository } from '../infrastructure/audit.repository';

describe('AuditService', () => {
  const list = jest.fn();
  const service = new AuditService({ list } as unknown as AuditRepository);
  beforeEach(() => jest.clearAllMocks());

  it('limite les résultats par défaut à 30', async () => {
    list.mockResolvedValue({ items: [], nextCursor: null });
    await service.list('actor', {});
    expect(list).toHaveBeenCalledWith('actor', expect.objectContaining({ limit: 30 }));
  });

  it.each(['0', '-1', '101', 'abc', '1.5'])('rejette la limite %s', async (limit) => {
    expect(() => service.list('actor', { limit })).toThrow(BadRequestException);
    expect(list).not.toHaveBeenCalled();
  });

  it('convertit les bornes de dates valides', async () => {
    list.mockResolvedValue({ items: [], nextCursor: null });
    await service.list('actor', { from: '2026-01-01', to: '2026-01-31' });
    expect(list).toHaveBeenCalledWith(
      'actor',
      expect.objectContaining({
        from: new Date('2026-01-01T00:00:00.000Z'),
        to: new Date('2026-01-31T00:00:00.000Z'),
      }),
    );
  });

  it.each(['2026-02-30', '2026-1-01', 'not-a-date'])('rejette la date invalide %s', async (from) => {
    expect(() => service.list('actor', { from })).toThrow(BadRequestException);
  });

  it('rejette un intervalle inversé', async () => {
    expect(() => service.list('actor', { from: '2026-02-01', to: '2026-01-01' })).toThrow(
      BadRequestException,
    );
  });

  it('transmet les filtres à la synthèse', async () => {
    const repository = {
      list,
      summary: jest.fn().mockResolvedValue({ total: 0, byAction: [], byEntityType: [] }),
    };
    const audit = new AuditService(repository as unknown as AuditRepository);
    await audit.summary('admin', { actorId: 'user', from: '2026-01-01', action: 'CREATE' });
    expect(repository.summary).toHaveBeenCalledWith(
      'admin',
      expect.objectContaining({
        actorId: 'user',
        action: 'CREATE',
        from: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
  });

  it('rejette une période inversée dans la synthèse', async () => {
    expect(() => service.summary('admin', { from: '2026-02-01', to: '2026-01-01' })).toThrow(
      BadRequestException,
    );
  });

  it('rejette les filtres vides', async () => {
    expect(() => service.list('actor', { action: '  ' })).toThrow(BadRequestException);
  });
});
