import { Injectable } from '@nestjs/common';
import { SalesDocument, SalesPdfPort } from '../application/sales-documents.port';
import { preparePdfImage } from '../../../shared/pdf-image';
import { renderTextPdf } from './text-pdf';

const TITLES = {
  INVOICE: 'FACTURE',
  PROFORMA: 'PROFORMA',
  DELIVERY: 'BON DE LIVRAISON',
  PAYMENT: 'JUSTIFICATIF DE PAIEMENT',
  CREDIT_NOTE: 'AVOIR CLIENT',
};

const STATUS: Record<string, string> = {
  DRAFT: 'BROUILLON - NON VALIDE',
  ISSUED: 'ÉMIS',
  ACCEPTED: 'ACCEPTÉ',
  CANCELLED: 'ANNULÉ - NON VALIDE',
  EXPIRED: 'EXPIRÉ - NON VALIDE',
  CONFIRMED: 'CONFIRMÉ',
  RECEIVED: 'ENCAISSÉ',
  REVERSED: 'CONTREPASSÉ - NON VALIDE',
};

const METHODS: Record<string, string> = {
  CASH: 'Espèces',
  WAVE: 'Wave',
  ORANGE_MONEY: 'Orange Money',
  MOBILE_MONEY: 'Paiement mobile',
  OTHER: 'Autre mode de règlement',
  BANK_TRANSFER: 'Virement bancaire',
  CHECK: 'Chèque',
  CHEQUE: 'Chèque',
};

function date(value: Date | null, timeZone = 'Africa/Dakar'): string {
  return value
    ? new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone,
      }).format(value)
    : 'Non émis';
}

function numberFr(value: string): string {
  const [whole, decimals] = value.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (decimals === undefined ? '' : ',' + decimals);
}

function detail(document: SalesDocument): string[] {
  switch (document.kind) {
    case 'DELIVERY':
      return [
        'Commande : ' + document.orderNumber,
        '',
        'DÉTAIL DES PRODUITS',
        ...document.lines.flatMap((line, index) => [
          '',
          index + 1 + '. ' + line.sku + ' | ' + line.name,
          'Magasin : ' + line.store,
          'Quantité : ' + numberFr(line.quantity),
        ]),
        '',
        'Réceptionnaire : __________________________',
        'Date et signature : ________________________',
      ];
    case 'PAYMENT':
      return [
        'Commande : ' + document.orderNumber,
        'N° historique du versement : ' + document.installmentNumber,
        'Mode de règlement : ' + (METHODS[document.method] ?? document.method),
        ...(document.externalReference ? ['Référence externe : ' + document.externalReference] : []),
        '',
        'MONTANT ENREGISTRÉ : ' + numberFr(document.amount) + ' FCFA',
        ...document.reversals.map(
          (row) =>
            'Contrepassation du ' +
            date(row.createdAt, document.company?.timeZone) +
            ' : ' +
            numberFr(row.amount) +
            ' FCFA',
        ),
        ...(document.reversals.length ? ['Ce justificatif ne prouve plus un encaissement actif.'] : []),
        '',
        'Justificatif interne du règlement enregistré ; ne remplace pas la facture.',
      ];
    case 'CREDIT_NOTE':
      return [
        'Facture d’origine : ' + document.invoiceNumber,
        'Motif : ' + document.reason,
        '',
        ...document.lines.flatMap((line) => [
          line.sku + ' | ' + line.name,
          'HT crédité : ' + numberFr(line.netAmount) + ' | TVA créditée : ' + numberFr(line.taxAmount),
        ]),
        '',
        ...(document.netAmount === null ? ['Ventilation HT historique non renseignée.'] : ['TOTAL HT : ' + numberFr(document.netAmount) + ' FCFA']),
        ...(document.taxAmount === null ? ['Ventilation TVA historique non renseignée.'] : ['TOTAL TVA : ' + numberFr(document.taxAmount) + ' FCFA']),
        'TOTAL TTC : ' + numberFr(document.amount) + ' FCFA',
        'Avoir financier ; aucun mouvement de stock implicite.',
      ];
    default:
      return [
        ...(document.expiresAt
          ? ['Expiration : ' + date(document.expiresAt, document.company?.timeZone)]
          : []),
        '',
        'DÉTAIL DES PRODUITS (FCFA / XOF)',
        ...document.lines.flatMap((line, index) => [
          '',
          index + 1 + '. ' + line.sku + ' | ' + line.name,
          'Quantité : ' + numberFr(line.quantity) + ' | Prix unitaire HT : ' + numberFr(line.unitPrice),
          'Remise HT : ' + numberFr(line.discount) + ' | TVA : ' + numberFr(line.taxRate) + ' %',
          ...(line.taxAmount === undefined ? [] : ['Montant TVA : ' + numberFr(line.taxAmount)]),
          'Total ligne TTC : ' + numberFr(line.total),
        ]),
        '',
        ...(document.totalHt === undefined ? [] : ['TOTAL HT : ' + numberFr(document.totalHt) + ' FCFA']),
        ...(document.totalTax === undefined ? [] : ['TOTAL TVA : ' + numberFr(document.totalTax) + ' FCFA']),
        'TOTAL TTC : ' + numberFr(document.totalTtc) + ' FCFA',
      ];
  }
}

@Injectable()
export class SalesPdfRenderer implements SalesPdfPort {
  render(document: SalesDocument): Buffer {
    const title = TITLES[document.kind];
    const status = STATUS[document.status] ?? document.status;
    const rows = [
      document.company?.legalName || 'DSolar-ERP',
      ...(document.company
        ? [
            document.company.tradeName && document.company.tradeName !== document.company.legalName
              ? document.company.tradeName
              : '',
            document.company.legalForm,
            document.company.taxId ? 'NINEA : ' + document.company.taxId : '',
            document.company.registrationNumber ? 'RCCM : ' + document.company.registrationNumber : '',
            document.company.address,
            document.company.phone,
            document.company.email,
            document.company.website,
          ].filter(Boolean)
        : ['Identité entreprise historique non renseignée.']),
      title + ' : ' + document.number,
      'Statut : ' + status,
      'Date : ' + date(document.issuedAt, document.company?.timeZone),
      '',
      'CLIENT : ' + document.customer.name,
      ...(document.customer.address ? ['Adresse : ' + document.customer.address] : []),
      ...(document.customer.taxId ? ['Identifiant fiscal : ' + document.customer.taxId] : []),
      ...(document.customer.phone ? ['Téléphone : ' + document.customer.phone] : []),
      '',
      ...detail(document),
      ...(document.kind === 'INVOICE' || document.kind === 'PROFORMA'
        ? [
            document.company?.bankName ? 'Banque : ' + document.company.bankName : '',
            document.company?.bankAccount ? 'Compte : ' + document.company.bankAccount : '',
          ].filter(Boolean)
        : []),
      ...(document.company?.documentFooter ? [document.company.documentFooter] : []),
      '',
      'Document interne généré depuis les données enregistrées.',
      'Libellés et coordonnées issus des fiches actuelles.',
    ];
    // Short warning on every page, within the fixed-width heading area.
    const invalid = ['DRAFT', 'CANCELLED', 'EXPIRED', 'REVERSED'].includes(document.status);
    const heading = invalid ? title + ' - NON VALIDE' : title;
    const logo = document.logo ? preparePdfImage(document.logo.data, document.logo.mimeType) : undefined;
    return Buffer.from(renderTextPdf(heading, rows, logo), 'ascii');
  }
}
