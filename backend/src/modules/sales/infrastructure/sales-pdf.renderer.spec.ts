import { NotFoundException } from '@nestjs/common';
import { SalesDocumentsService } from '../application/sales-documents.service';
import { SalesDocument } from '../application/sales-documents.port';
import { SalesPdfRenderer } from './sales-pdf.renderer';
import { renderTextPdf } from './text-pdf';

describe('Documents PDF commerciaux', () => {
  const doc: SalesDocument = {
    kind: 'INVOICE',
    number: 'FAC-1',
    status: 'DRAFT',
    issuedAt: null,
    customer: { name: 'Client', address: null, taxId: null, phone: null },
    lines: [
      {
        sku: 'SOL',
        name: 'Centrale',
        quantity: '1.000',
        unitPrice: '100.00',
        discount: '0.00',
        taxRate: '18.0000',
        taxAmount: '18.00',
        total: '118.00',
      },
    ],
    totalHt: '100.00',
    totalTax: '18.00',
    totalTtc: '118.00',
  };
  it('produit un PDF avec les montants stockés et un statut brouillon', () => {
    const data = new SalesPdfRenderer().render(doc).toString('ascii');
    expect(data.startsWith('%PDF-1.4')).toBe(true);
    expect(data).toContain(Buffer.from('TOTAL TTC : 118,00 FCFA', 'latin1').toString('hex'));
    expect(data).toContain(Buffer.from('BROUILLON - NON VALIDE', 'latin1').toString('hex'));
  });
  it('intègre le logo téléversé comme image PDF sans modifier les montants', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DQAAAEgQGALFXOsAAAAABJRU5ErkJggg==',
      'base64',
    );
    const data = new SalesPdfRenderer()
      .render({ ...doc, logo: { mimeType: 'image/png', data: png } })
      .toString('ascii');
    expect(data).toContain('/Subtype /Image');
    expect(data).toContain('/Logo Do');
    expect(data).toContain(Buffer.from('TOTAL TTC : 118,00 FCFA', 'latin1').toString('hex'));
  });
  it('génère un avoir avec la référence de facture et les montants fiscaux enregistrés', () => {
    const data = new SalesPdfRenderer()
      .render({
        kind: 'CREDIT_NOTE',
        number: 'AV-1',
        status: 'ISSUED',
        issuedAt: new Date('2026-11-26'),
        customer: doc.customer,
        invoiceNumber: 'FAC-1',
        reason: 'Correction de prix',
        amount: '59.00',
        netAmount: '50.00',
        taxAmount: '9.00',
        lines: [{ sku: 'SOL', name: 'Centrale', netAmount: '50.00', taxAmount: '9.00' }],
      })
      .toString('ascii');
    for (const row of ['TOTAL HT : 50,00 FCFA', 'TOTAL TVA : 9,00 FCFA', 'TOTAL TTC : 59,00 FCFA']) {
      expect(data).toContain(Buffer.from(row, 'latin1').toString('hex'));
    }
  });
  it('pagine les lignes et conserve les offsets xref exacts', () => {
    const data = renderTextPdf(
      'TEST',
      Array.from({ length: 100 }, () => 'ligne'),
    );
    expect(data).toContain('/Count 3');
    const xref = Number(data.match(/startxref\n(\d+)/)?.[1]);
    expect(data.slice(xref, xref + 4)).toBe('xref');
    const entries = data.slice(xref).split('\n').slice(3, 12);
    entries.forEach((entry, index) =>
      expect(data.slice(Number(entry.slice(0, 10))).startsWith(index + 1 + ' 0 obj')).toBe(true),
    );
  });
  it('encode les caractères spéciaux au lieu de les insérer comme opérateurs PDF', () => {
    const data = renderTextPdf('TEST', ['(x) /JavaScript \\']);
    expect(data).not.toContain('/JavaScript');
    expect(data).toContain(Buffer.from('(x) /JavaScript \\', 'latin1').toString('hex'));
  });
  it('génère un bon de livraison sans divulguer les prix', () => {
    const data = new SalesPdfRenderer()
      .render({
        kind: 'DELIVERY',
        number: 'BL-1',
        status: 'CONFIRMED',
        issuedAt: new Date('2026-11-01'),
        customer: doc.customer,
        orderNumber: 'CMD-1',
        lines: [{ sku: 'SOL', name: 'Centrale', quantity: '2.000', store: 'M1 - Dakar' }],
      })
      .toString('ascii');
    expect(data).toContain(Buffer.from('Quantité : 2,000', 'latin1').toString('hex'));
    expect(data).not.toContain(Buffer.from('Prix unitaire', 'latin1').toString('hex'));
  });
  it('marque un règlement contrepassé comme non valide', () => {
    const data = new SalesPdfRenderer()
      .render({
        kind: 'PAYMENT',
        number: 'payment-id',
        status: 'REVERSED',
        issuedAt: new Date('2026-11-01'),
        customer: doc.customer,
        orderNumber: 'CMD-1',
        installmentNumber: 3,
        amount: '15000.00',
        method: 'CASH',
        externalReference: null,
        reversals: [{ amount: '15000.00', createdAt: new Date('2026-11-02') }],
      })
      .toString('ascii');
    expect(data).toContain(Buffer.from('JUSTIFICATIF DE PAIEMENT - NON VALIDE', 'latin1').toString('hex'));
    expect(data).toContain(Buffer.from('MONTANT ENREGISTRÉ : 15 000,00 FCFA', 'latin1').toString('hex'));
    expect(data).toContain(
      Buffer.from('Contrepassation du 02/11/2026 : 15 000,00 FCFA', 'latin1').toString('hex'),
    );
  });
  it('refuse un document rattaché à une commande sans identifiant de commande', async () => {
    const repository = { find: jest.fn() };
    const service = new SalesDocumentsService(repository, { render: jest.fn() });
    await expect(service.download('PAYMENT', 'id', 'actor')).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.find).not.toHaveBeenCalled();
  });
  it('transmet l’identifiant de la commande à la lecture sécurisée', async () => {
    const repository = { find: jest.fn().mockResolvedValue(null) };
    const service = new SalesDocumentsService(repository, { render: jest.fn() });
    await expect(service.download('DELIVERY', 'id', 'actor', 'order')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.find).toHaveBeenCalledWith('DELIVERY', 'id', 'actor', 'order');
  });
  it('refuse la génération avant tout rendu si le document est inaccessible', async () => {
    const repository = { find: jest.fn().mockResolvedValue(null) };
    const renderer = { render: jest.fn() };
    const service = new SalesDocumentsService(repository, renderer);
    await expect(service.download('INVOICE', 'id', 'actor')).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.find).toHaveBeenCalledWith('INVOICE', 'id', 'actor');
    expect(renderer.render).not.toHaveBeenCalled();
  });
});
