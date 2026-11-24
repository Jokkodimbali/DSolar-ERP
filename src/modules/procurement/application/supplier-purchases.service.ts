import { Inject, Injectable } from '@nestjs/common';
import { SUPPLIER_PURCHASES, SupplierPurchasesPort } from './supplier-purchases.port';

@Injectable()
export class SupplierPurchasesService {
  constructor(@Inject(SUPPLIER_PURCHASES) private readonly repository: SupplierPurchasesPort) {}

  async summary(supplierId: string, actorId: string) {
    const data = await this.repository.snapshot(supplierId, actorId);
    return {
      ...data,
      currency: 'XOF',
      basis: 'CONFIRMED_RECEIPTS_AND_RETURNS',
      // A receipt valuation is not an invoice, and a credit is not a payment.
      payableBalance: null,
      payableBalanceAvailable: false,
    };
  }
}
