import { assertSolarDiscounts, discountedProductIds } from './solar-discounts';

describe('Remises réservées aux centrales solaires', () => {
  const products = [
    { id: 'solar', isSolarPlant: true },
    { id: 'other', isSolarPlant: false },
  ];
  it('accepte un devis mixte lorsque seule la centrale bénéficie de la remise', () => {
    expect(() =>
      assertSolarDiscounts(
        [
          { productId: 'solar', discount: '100.00' },
          { productId: 'other', discount: '0.00' },
        ],
        products,
      ),
    ).not.toThrow();
  });
  it.each(['0.01', '100.00'])('refuse toute remise sur un autre produit : %s', (discount) => {
    expect(() => assertSolarDiscounts([{ productId: 'other', discount }], products)).toThrow();
  });
  it('refuse une remise sur un produit absent', () => {
    expect(() => assertSolarDiscounts([{ productId: 'unknown', discount: '1' }], products)).toThrow();
  });
  it('déduplique les produits remisés de plusieurs magasins', () => {
    expect(
      discountedProductIds([
        { productId: 'solar', discount: '2' },
        { productId: 'solar', discount: '3' },
        { productId: 'other', discount: '0' },
      ]),
    ).toEqual(['solar']);
  });
});
