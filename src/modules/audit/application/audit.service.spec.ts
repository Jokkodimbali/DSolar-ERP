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

  it('rejette les filtres vides', async () => {
    await expect(service.list('actor', { action: '  ' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
