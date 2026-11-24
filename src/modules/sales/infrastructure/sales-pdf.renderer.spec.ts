import { NotFoundException } from '@nestjs/common';
import { SalesDocumentsService } from '../application/sales-documents.service';
import { SalesDocument } from '../application/sales-documents.port';
import { SalesPdfRenderer } from './sales-pdf.renderer';
import { renderTextPdf } from './text-pdf';

describe('Documents PDF commerciaux', () => {
  const doc: SalesDocument = {
    kind: 'INVOICE', number: 'FAC-1', status: 'DRAFT', issuedAt: null,
    customer: { name: 'Client', address: null, taxId: null, phone: null },
    lines: [{ sku: 'SOL', name: 'Centrale', quantity: '1.000', unitPrice: '100.00',
      discount: '0.00', taxRate: '18.0000', taxAmount: '18.00', total: '118.00' }],
    totalHt: '100.00', totalTax: '18.00', totalTtc: '118.00',
  };
  it('produit un PDF avec les montants stockés et un statut brouillon', () => {
    const data = new SalesPdfRenderer().render(doc).toString('ascii');
    expect(data.startsWith('%PDF-1.4')).toBe(true);
    expect(data).toContain(Buffer.from('TOTAL TTC : 118.00 FCFA', 'latin1').toString('hex'));
    expect(data).toContain(Buffer.from('BROUILLON - NON VALIDE', 'latin1').toString('hex'));
  });
  it('pagine les lignes et conserve les offsets xref exacts', () => {
    const data = renderTextPdf('TEST', Array.from({ length: 100 }, () => 'ligne'));
    expect(data).toContain('/Count 3');
    const xref = Number(data.match(/startxref\n(\d+)/)?.[1]);
    expect(data.slice(xref, xref + 4)).toBe('xref');
    const entries = data.slice(xref).split('\n').slice(3, 12);
    entries.forEach((entry, index) => expect(data.slice(Number(entry.slice(0, 10))).startsWith((index + 1) + ' 0 obj')).toBe(true));
  });
  it('encode les caractères spéciaux au lieu de les insérer comme opérateurs PDF', () => {
    const data = renderTextPdf('TEST', ['(x) /JavaScript \\']);
    expect(data).not.toContain('/JavaScript');
    expect(data).toContain(Buffer.from('(x) /JavaScript \\', 'latin1').toString('hex'));
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
