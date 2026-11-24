import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { calculateSalesTotals } from '../domain/sales-pricing';

type PricingLine = {
  quantity: number | Prisma.Decimal;
  unitPrice: number | Prisma.Decimal;
  discount: number | Prisma.Decimal;
  taxRate: number | Prisma.Decimal;
};

export function salesPricing(lines: PricingLine[]) {
  try {
    return calculateSalesTotals(lines.map((line) => ({
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
      discount: String(line.discount),
      taxRate: String(line.taxRate),
    })));
  } catch (error) {
    throw new ConflictException(error instanceof Error ? error.message : 'Calcul commercial invalide.');
  }
}

export function assertStoredSalesPricing(
  lines: (PricingLine & { lineTotal: Prisma.Decimal })[],
  total: Prisma.Decimal,
) {
  const pricing = salesPricing(lines);
  if (!total.eq(pricing.totalTtc) || lines.some((line, index) => !line.lineTotal.eq(pricing.lines[index].total)))
    throw new ConflictException('Montants historiques incohérents : régularisation du document requise.');
  return pricing;
}
