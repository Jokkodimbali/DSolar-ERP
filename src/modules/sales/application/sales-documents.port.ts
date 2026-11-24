export const SALES_DOCUMENTS = Symbol('SALES_DOCUMENTS');
export const SALES_PDF = Symbol('SALES_PDF');
export type SalesDocumentKind = 'PROFORMA' | 'INVOICE';

export interface SalesDocument {
  kind: SalesDocumentKind;
  number: string;
  status: string;
  issuedAt: Date | null;
  expiresAt?: Date | null;
  customer: { name: string; address: string | null; taxId: string | null; phone: string | null };
  lines: {
    sku: string; name: string; quantity: string; unitPrice: string; discount: string;
    taxRate: string; taxAmount?: string; total: string;
  }[];
  totalHt?: string;
  totalTax?: string;
  totalTtc: string;
}

export interface SalesDocumentsPort {
  find(kind: SalesDocumentKind, id: string, actorId: string): Promise<SalesDocument | null>;
}

export interface SalesPdfPort {
  render(document: SalesDocument): Buffer;
}
