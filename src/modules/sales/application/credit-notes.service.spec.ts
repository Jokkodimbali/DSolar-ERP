import { CreditNotesRepository } from './credit-notes.port';
import { CreditNotesService } from './credit-notes.service';

describe('CreditNotesService', () => {
  const repository: jest.Mocked<CreditNotesRepository> = {
    list: jest.fn(),
    issue: jest.fn(),
  };
  const service = new CreditNotesService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('liste les avoirs accessibles', async () => {
    repository.list.mockResolvedValue([]);
    await expect(service.list('invoice', 'actor')).resolves.toEqual([]);
    expect(repository.list).toHaveBeenCalledWith('invoice', 'actor');
  });

  it('émet un avoir avec motif documenté', async () => {
    repository.issue.mockResolvedValue({ id: 'credit-note' });
    await service.issue('invoice', 'actor', '2500', 'Correction de facturation');
    expect(repository.issue).toHaveBeenCalledWith('invoice', 'actor', '2500', 'Correction de facturation');
  });
});
