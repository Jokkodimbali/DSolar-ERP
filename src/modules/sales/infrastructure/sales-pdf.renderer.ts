import { Injectable } from '@nestjs/common';
import { SalesDocument, SalesPdfPort } from '../application/sales-documents.port';
import { renderTextPdf } from './text-pdf';

@Injectable()
export class SalesPdfRenderer implements SalesPdfPort {
  render(document: SalesDocument): Buffer {
    const title = document.kind === 'INVOICE' ? 'FACTURE' : 'PROFORMA';
    const status: Record<string, string> = {
      DRAFT: 'BROUILLON - NON VALIDE', ISSUED: 'ÉMIS', ACCEPTED: 'ACCEPTÉ',
      CANCELLED: 'ANNULÉ - NON VALIDE', EXPIRED: 'EXPIRÉ - NON VALIDE',
    };
    const date = (value: Date | null) => value ? value.toISOString().slice(0, 10) : 'Non émis';
    const rows = [
      'D-Solar and Agri | DSolar-ERP',
      title + ' : ' + document.number,
      'Statut : ' + (status[document.status] ?? document.status),
      'Émission : ' + date(document.issuedAt),
      ...(document.expiresAt ? ['Expiration : ' + date(document.expiresAt)] : []),
      '',
      'CLIENT : ' + document.customer.name,
      ...(document.customer.address ? ['Adresse : ' + document.customer.address] : []),
      ...(document.customer.taxId ? ['Identifiant fiscal : ' + document.customer.taxId] : []),
      ...(document.customer.phone ? ['Téléphone : ' + document.customer.phone] : []),
      '',
      'DÉTAIL DES PRODUITS (FCFA / XOF)',
      ...document.lines.flatMap((line, index) => [
        '',
        (index + 1) + '. ' + line.sku + ' | ' + line.name,
        'Quantité : ' + line.quantity + ' | Prix unitaire HT : ' + line.unitPrice,
        'Remise HT : ' + line.discount + ' | TVA : ' + line.taxRate + ' %',
        ...(line.taxAmount === undefined ? [] : ['Montant TVA : ' + line.taxAmount]),
        'Total ligne TTC : ' + line.total,
      ]),
      '',
      ...(document.totalHt === undefined ? [] : ['TOTAL HT : ' + document.totalHt + ' FCFA']),
      ...(document.totalTax === undefined ? [] : ['TOTAL TVA : ' + document.totalTax + ' FCFA']),
      'TOTAL TTC : ' + document.totalTtc + ' FCFA',
      '',
      'Document interne généré depuis les montants enregistrés.',
      'Libellés et coordonnées issus du catalogue et du client actuels.',
    ];
    return Buffer.from(renderTextPdf(title, rows), 'ascii');
  }
}
