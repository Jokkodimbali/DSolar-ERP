import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProformasRepository } from './proformas.port';
import { ProformasService } from './proformas.service';

describe('ProformasService', () => {
  const repository = {
    list: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    issue: jest.fn(),
    update: jest.fn(),
    transition: jest.fn(),
  } as jest.Mocked<ProformasRepository>;
  const service = new ProformasService(repository);
  const base = {
    number: ' PF-001 ',
    customerId: 'customer-id',
    lines: [
      {
        productId: 'product-id',
        storeId: 'store-id',
        quantity: 2,
        unitPrice: 100,
        discount: 10,
        taxRate: 18,
      },
    ],
  };
  beforeEach(() => jest.clearAllMocks());
  it('normalise le numéro', async () => {
    await service.create(base);
    expect(repository.create).toHaveBeenCalledWith({ ...base, number: 'PF-001' });
  });
  it('refuse un devis sans lignes', async () => {
    await expect(service.create({ ...base, lines: [] })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse une remise supérieure au montant brut', async () => {
    await expect(
      service.create({ ...base, lines: [{ ...base.lines[0], discount: 201 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse un taux supérieur à 100 %', async () => {
    await expect(
      service.create({ ...base, lines: [{ ...base.lines[0], taxRate: 101 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('retourne 404 pour un devis absent', async () => {
    repository.find.mockResolvedValue(null);
    await expect(service.get('absent')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('refuse une date d’expiration passée', async () => {
    await expect(service.create({ ...base, expiresAt: '2020-01-01T00:00:00.000Z' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it('refuse l’acceptation d’un devis expiré', async () => {
    repository.find.mockResolvedValue({ status: 'ISSUED', expiresAt: new Date('2020-01-01') });
    await expect(service.accept('id')).rejects.toBeInstanceOf(ConflictException);
  });
  it('refuse la réémission', async () => {
    repository.find.mockResolvedValue({ status: 'ISSUED', expiresAt: null });
    await expect(service.issue('id')).rejects.toBeInstanceOf(ConflictException);
  });
});
