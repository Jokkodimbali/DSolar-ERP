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
  const actorId = 'active-user';
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
    await service.create(base, actorId);
    expect(repository.create).toHaveBeenCalledWith({ ...base, number: 'PF-001' }, actorId);
  });
  it('conserve le numéro existant lors d’une modification sans numéro', async () => {
    repository.find.mockResolvedValue({ status: 'DRAFT', expiresAt: null });
    const withoutNumber = { customerId: base.customerId, lines: base.lines };
    await service.update('id', withoutNumber, actorId);
    expect(repository.update).toHaveBeenCalledWith('id', withoutNumber, actorId);
  });
  it('refuse un devis sans lignes', async () => {
    await expect(service.create({ ...base, lines: [] }, actorId)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse une remise supérieure au montant brut', async () => {
    await expect(
      service.create({ ...base, lines: [{ ...base.lines[0], discount: 201 }] }, actorId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse un taux supérieur à 100 %', async () => {
    await expect(
      service.create({ ...base, lines: [{ ...base.lines[0], taxRate: 101 }] }, actorId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse plus de cent lignes', async () => {
    const lines = Array.from({ length: 101 }, (_, i) => ({
      ...base.lines[0],
      productId: String(i),
    }));
    await expect(service.create({ ...base, lines }, actorId)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse les montants dépassant la précision autorisée', async () => {
    const lines = [{ ...base.lines[0], unitPrice: 10.001 }];
    await expect(service.create({ ...base, lines }, actorId)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse les quantités dépassant trois décimales', async () => {
    const lines = [{ ...base.lines[0], quantity: 1.0001 }];
    await expect(service.create({ ...base, lines }, actorId)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('retourne 404 pour un devis absent', async () => {
    repository.find.mockResolvedValue(null);
    await expect(service.get('absent', actorId)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('refuse une date d’expiration passée', async () => {
    await expect(
      service.create({ ...base, expiresAt: '2020-01-01T00:00:00.000Z' }, actorId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('refuse l’acceptation d’un devis expiré', async () => {
    repository.find.mockResolvedValue({ status: 'ISSUED', expiresAt: new Date('2020-01-01') });
    await expect(service.accept('id', actorId)).rejects.toBeInstanceOf(ConflictException);
  });
  it('refuse la réémission', async () => {
    repository.find.mockResolvedValue({ status: 'ISSUED', expiresAt: null });
    await expect(service.issue('id', actorId)).rejects.toBeInstanceOf(ConflictException);
  });
});
