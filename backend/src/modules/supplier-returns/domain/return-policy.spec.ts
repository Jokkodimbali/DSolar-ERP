import { validReturnQuantity } from './return-policy';

describe('Quantité de retour', () => {
  it.each(['1', '0.001', '123.456'])('accepte %s', (value) => {
    expect(validReturnQuantity(value)).toBe(true);
  });
  it.each(['0', '0.000', '-1', '1.0001', '1e3', '1000000000000000'])('refuse %s', (value) => {
    expect(validReturnQuantity(value)).toBe(false);
  });
});
