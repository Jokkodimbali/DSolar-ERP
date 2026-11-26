export const SUPPLIER_PURCHASES = Symbol('SUPPLIER_PURCHASES');

export interface SupplierPurchasesSnapshot {
  supplierId: string;
  supplierName: string;
  active: boolean;
  confirmedReceipts: string;
  confirmedReturns: string;
  recordedCredits: string;
  receivedValue: string;
  returnedValue: string;
  creditValue: string;
  netReceivedValue: string;
  returnsAwaitingCredit: string;
}

export interface SupplierPurchasesPort {
  snapshot(supplierId: string, actorId: string): Promise<SupplierPurchasesSnapshot>;
}
