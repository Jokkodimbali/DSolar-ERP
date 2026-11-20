import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaGoodsReceiptsRepository } from './prisma-goods-receipts.repository';

describe('PrismaGoodsReceiptsRepository.confirm', () => {
  const serializationConflict = () =>
    new Prisma.PrismaClientKnownRequestError('Serialization conflict', {
      code: 'P2034',
      clientVersion: '6.19.3',
    });

  it('réessaie une transaction après un conflit sérialisable', async () => {
    const result = { id: 'receipt-id', status: 'CONFIRMED' };
    const prisma = {
      $transaction: jest.fn().mockRejectedValueOnce(serializationConflict()).mockResolvedValueOnce(result),
    } as unknown as PrismaService;
    const repository = new PrismaGoodsReceiptsRepository(prisma);

    await expect(repository.confirm('receipt-id', 'actor-id')).resolves.toBe(result);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('retourne un conflit HTTP si les reprises sont épuisées', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(serializationConflict()),
    } as unknown as PrismaService;
    const repository = new PrismaGoodsReceiptsRepository(prisma);

    await expect(repository.confirm('receipt-id', 'actor-id')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
