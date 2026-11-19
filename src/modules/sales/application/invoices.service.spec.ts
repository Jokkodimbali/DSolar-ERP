import { NotFoundException } from '@nestjs/common';
import { InvoicesRepository } from './invoices.port';
import { InvoicesService } from './invoices.service';

describe('InvoicesService', () => {
  const repository: jest.Mocked<InvoicesRepository> = {
    list: jest.fn(),
    find: jest.fn(),
    createFromOrder: jest.fn(),
    issue: jest.fn(),
    cancel: jest.fn(),
  };
  const service = new InvoicesService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('liste uniquement les factures accessibles', async () => {
    repository.list.mockResolvedValue([]);
    await expect(service.list('actor')).resolves.toEqual([]);
    expect(repository.list).toHaveBeenCalledWith('actor');
  });

  it('masque les factures absentes ou interdites', async () => {
    repository.find.mockResolvedValue(null);
    await expect(service.get('invoice', 'actor')).rejects.toThrow(NotFoundException);
  });

  it('crée une facture depuis la commande', async () => {
    repository.createFromOrder.mockResolvedValue({ id: 'invoice' });
    await service.createFromOrder('order', 'actor');
    expect(repository.createFromOrder).toHaveBeenCalledWith('order', 'actor');
  });

  it('émet une facture', async () => {
    repository.issue.mockResolvedValue({ status: 'ISSUED' });
    await service.issue('invoice', 'actor');
    expect(repository.issue).toHaveBeenCalledWith('invoice', 'actor');
  });

  it('annule un brouillon', async () => {
    repository.cancel.mockResolvedValue({ status: 'CANCELLED' });
    await service.cancel('invoice', 'actor');
    expect(repository.cancel).toHaveBeenCalledWith('invoice', 'actor');
  });
});
