import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SALES_DOCUMENTS,
  SALES_PDF,
  SalesDocumentKind,
  SalesDocumentsPort,
  SalesPdfPort,
} from './sales-documents.port';

@Injectable()
export class SalesDocumentsService {
  constructor(
    @Inject(SALES_DOCUMENTS) private readonly documents: SalesDocumentsPort,
    @Inject(SALES_PDF) private readonly pdf: SalesPdfPort,
  ) {}

  async download(kind: SalesDocumentKind, id: string, actorId: string, orderId?: string): Promise<Buffer> {
    if ((kind === 'DELIVERY' || kind === 'PAYMENT') && !orderId)
      throw new NotFoundException('Document introuvable ou non autorisé.');
    const document =
      orderId === undefined
        ? await this.documents.find(kind, id, actorId)
        : await this.documents.find(kind, id, actorId, orderId);
    if (!document) throw new NotFoundException('Document introuvable ou non autorisé.');
    return this.pdf.render(document);
  }
}
