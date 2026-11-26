import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';

export type SalesDocument =
  | { kind: 'proforma' | 'invoice' | 'credit'; id: string }
  | { kind: 'delivery' | 'payment'; id: string; orderId: string };

export function documentPath(document: SalesDocument): string {
  const id = storeId(document.id);
  switch (document.kind) {
    case 'proforma':
      return apiPath('/proformas/' + id + '/pdf');
    case 'invoice':
      return apiPath('/invoices/' + id + '/pdf');
    case 'credit':
      return apiPath('/credit-notes/' + id + '/pdf');
    case 'delivery':
      return apiPath('/sales-orders/' + storeId(document.orderId) + '/deliveries/' + id + '/pdf');
    case 'payment':
      return apiPath('/sales-orders/' + storeId(document.orderId) + '/payments/' + id + '/pdf');
    default:
      throw new Error('Type de document invalide.');
  }
}

export function documentFilename(document: SalesDocument): string {
  const prefix = {
    proforma: 'proforma',
    invoice: 'facture',
    delivery: 'livraison',
    payment: 'reglement',
    credit: 'avoir',
  };
  return prefix[document.kind] + '-' + storeId(document.id) + '.pdf';
}

export async function validatePdf(blob: Blob): Promise<Blob> {
  if (blob.type.split(';')[0]?.trim().toLowerCase() !== 'application/pdf' || blob.size < 8)
    throw new Error('Le serveur n’a pas renvoyé un document PDF valide.');
  const signature = await blob.slice(0, 8).text();
  if (!/^%PDF-[12]\.\d$/.test(signature)) throw new Error('Signature PDF invalide.');
  return blob;
}
