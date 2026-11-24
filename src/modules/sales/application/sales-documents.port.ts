export const SALES_DOCUMENTS = Symbol('SALES_DOCUMENTS');
export const SALES_PDF = Symbol('SALES_PDF');
export type SalesDocumentKind = 'PROFORMA' | 'INVOICE' | 'DELIVERY' | 'PAYMENT';

export interface CompanyDocumentIdentity {
  legalName: string;
  tradeName: string;
  taxId: string;
  registrationNumber: string;
  legalForm: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  bankAccount: string;
  documentFooter: string;
}

interface DocumentBase {
  company?: CompanyDocumentIdentity | null;
  number: string;
  status: string;
  issuedAt: Date | null;
  customer: { name: string; address: string | null; taxId: string | null; phone: string | null };
}

export interface CommercialDocument extends DocumentBase {
  kind: 'PROFORMA' | 'INVOICE';
  expiresAt?: Date | null;
  lines: {
    sku: string;
    name: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    taxRate: string;
    taxAmount?: string;
    total: string;
  }[];
  totalHt?: string;
  totalTax?: string;
  totalTtc: string;
}

export interface DeliveryDocument extends DocumentBase {
  kind: 'DELIVERY';
  orderNumber: string;
  lines: { sku: string; name: string; quantity: string; store: string }[];
}

export interface PaymentDocument extends DocumentBase {
  kind: 'PAYMENT';
  orderNumber: string;
  installmentNumber: number;
  amount: string;
  method: string;
  externalReference: string | null;
  reversals: { amount: string; createdAt: Date }[];
}

export type SalesDocument = CommercialDocument | DeliveryDocument | PaymentDocument;

export interface SalesDocumentsPort {
  find(kind: SalesDocumentKind, id: string, actorId: string, orderId?: string): Promise<SalesDocument | null>;
}

export interface SalesPdfPort {
  render(document: SalesDocument): Buffer;
}
