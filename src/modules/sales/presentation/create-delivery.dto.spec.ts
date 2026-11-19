import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDeliveryDto } from './create-delivery.dto';

describe('CreateDeliveryDto', () => {
  const storeId = '00000000-0000-4000-8000-000000000001';
  const productId = '00000000-0000-4000-8000-000000000002';

  const validateQuantity = (quantity: string) =>
    validate(
      plainToInstance(CreateDeliveryDto, {
        lines: [{ storeId, productId, quantity }],
      }),
    );

  it.each(['1', '0.001', '12.345'])('accepte la quantité %s', async (quantity) => {
    await expect(validateQuantity(quantity)).resolves.toHaveLength(0);
  });

  it.each(['-1', '1.1234', '1e3', 'NaN', '1,5', ''])('rejette la quantité %s', async (quantity) => {
    expect((await validateQuantity(quantity)).length).toBeGreaterThan(0);
  });

  it('rejette un bon sans ligne', async () => {
    const dto = plainToInstance(CreateDeliveryDto, { lines: [] });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
