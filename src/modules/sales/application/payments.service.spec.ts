import { PaymentsRepository } from './payments.port';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const repository: jest.Mocked<PaymentsRepository> = {
    list: jest.fn(),
    record: jest.fn(),
    reverse: jest.fn(),
    allocate: jest.fn(),
  };
  const service = new PaymentsService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('liste les encaissements accessibles', async () => {
    repository.list.mockResolvedValue([]);
    await expect(service.list('order', 'actor')).resolves.toEqual([]);
    expect(repository.list).toHaveBeenCalledWith('order', 'actor');
  });

  it('enregistre une demande de paiement avec clé idempotente', async () => {
    const input = {
      amount: '15000.00',
      method: 'CASH' as const,
      idempotencyKey: 'payment-unique-123',
    };
    repository.record.mockResolvedValue({ id: 'payment' });
    await service.record('order', 'actor', input);
    expect(repository.record).toHaveBeenCalledWith('order', 'actor', input);
  });
});
