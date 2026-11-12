import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.port';
describe('InventoryService', () => {
  const repository: InventoryRepository = { getBalance: jest.fn(), adjust: jest.fn() };
  const service = new InventoryService(repository);
  const valid = {
    storeId: 's',
    productId: 'p',
    actorId: 'u',
    quantity: '2.500',
    direction: 'IN' as const,
    reason: 'Correction inventaire',
    operationKey: 'k',
  };
  it('refuse les quantités négatives', async () => {
    expect(() => service.adjust({ ...valid, quantity: '-1' })).toThrow(BadRequestException);
  });
  it('refuse plus de trois décimales', async () => {
    expect(() => service.adjust({ ...valid, quantity: '1.0001' })).toThrow(BadRequestException);
  });
  it('refuse une justification trop courte', async () => {
    expect(() => service.adjust({ ...valid, reason: 'abc' })).toThrow(BadRequestException);
  });
  it('délègue une commande valide au repository', async () => {
    await service.adjust(valid);
    expect(repository.adjust).toHaveBeenCalledWith(valid);
  });
});
