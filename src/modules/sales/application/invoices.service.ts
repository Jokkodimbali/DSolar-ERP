import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { INVOICES_REPOSITORY, InvoicesRepository } from './invoices.port';

@Injectable()
export class InvoicesService {
  constructor(@Inject(INVOICES_REPOSITORY) private readonly invoices: InvoicesRepository) {}

  list(actorId: string) {
    return this.invoices.list(actorId);
  }

  async get(id: string, actorId: string) {
    const invoice = await this.invoices.find(id, actorId);
    if (!invoice) throw new NotFoundException('Facture introuvable ou non autorisée.');
    return invoice;
  }

  createFromOrder(orderId: string, actorId: string) {
    return this.invoices.createFromOrder(orderId, actorId);
  }

  issue(id: string, actorId: string) {
    return this.invoices.issue(id, actorId);
  }

  cancel(id: string, actorId: string) {
    return this.invoices.cancel(id, actorId);
  }
}
