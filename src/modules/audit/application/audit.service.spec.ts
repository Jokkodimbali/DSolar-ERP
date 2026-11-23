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
    expect(list).toHaveBeenCalledWith('actor', { limit: 30 });
  });

  it.each(['0', '-1', '101', 'abc', '1.5'])('rejette la limite %s', async (limit) => {
    await expect(service.list('actor', { limit })).rejects.toBeInstanceOf(BadRequestException);
    expect(list).not.toHaveBeenCalled();
  });

  it('convertit les bornes de dates valides', async () => {
    list.mockResolvedValue({ items: [], nextCursor: null });
    await service.list('actor', { from: '2026-01-01', to: '2026-01-31' });
    expect(list).toHaveBeenCalledWith('actor', expect.objectContaining({
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-01-31T00:00:00.000Z'),
    }));
  });

  it.each(['2026-02-30', '2026-1-01', 'not-a-date'])('rejette la date invalide %s', async (from) => {
    await expect(service.list('actor', { from })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette un intervalle inversé', async () => {
    await expect(service.list('actor', { from: '2026-02-01', to: '2026-01-01' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette les filtres vides', async () => {
    await expect(service.list('actor', { action: '  ' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
