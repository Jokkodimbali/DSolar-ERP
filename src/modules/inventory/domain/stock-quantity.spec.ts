import { validStockQuantity } from './stock-quantity';

describe('Quantités de stock', () => {
  it.each(['0', '0.001', '1', '999999999999999.999'])('accepte %s', (value) => {
    expect(validStockQuantity(value)).toBe(true);
  });
  it.each(['-1', '0.0001', '1e3', 'NaN', 'Infinity', '', '01', '1000000000000000'])(
    'refuse %s',
    (value) => expect(validStockQuantity(value)).toBe(false),
  );
});
