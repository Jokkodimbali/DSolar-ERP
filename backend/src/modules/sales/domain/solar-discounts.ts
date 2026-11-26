export interface DiscountLine {
  productId: string;
  discount: string;
}

export function discountedProductIds(lines: DiscountLine[]): string[] {
  return [
    ...new Set(lines.filter((line) => !/^0+(?:\.0+)?$/.test(line.discount)).map((line) => line.productId)),
  ];
}

export function assertSolarDiscounts(
  lines: DiscountLine[],
  products: { id: string; isSolarPlant: boolean }[],
): void {
  const eligible = new Set(
    products.filter((product) => product.isSolarPlant === true).map((product) => product.id),
  );
  if (discountedProductIds(lines).some((id) => !eligible.has(id)))
    throw new Error('Les remises sont réservées aux centrales solaires.');
}
