import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  COMMERCIAL_SEARCH,
  CommercialCriteria,
  CommercialKind,
  CommercialSearchPort,
} from './commercial-search.port';

const statuses: Record<CommercialKind, readonly string[]> = {
  customers: [],
  proformas: ['DRAFT', 'ISSUED', 'ACCEPTED', 'CANCELLED', 'EXPIRED'],
  orders: ['DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'],
  invoices: ['DRAFT', 'ISSUED', 'CANCELLED'],
  deliveries: ['DRAFT', 'CONFIRMED', 'CANCELLED'],
  payments: ['ACTIVE', 'REVERSED'],
  'credit-notes': [],
};

@Injectable()
export class CommercialSearchService {
  constructor(@Inject(COMMERCIAL_SEARCH) private readonly repository: CommercialSearchPort) {}
  search(kind: CommercialKind, actorId: string, query: CommercialCriteria) {
    if (query.status && !statuses[kind].includes(query.status))
      throw new BadRequestException(
        'Statut invalide pour ce type de document. Valeurs autorisées : ' + statuses[kind].join(', '),
      );
    if (kind === 'customers' && (query.customerId || query.storeId || query.status))
      throw new BadRequestException('Ces filtres ne sont pas disponibles pour les clients.');
    if (query.orderId && !['deliveries', 'payments', 'invoices'].includes(kind))
      throw new BadRequestException('Le filtre par commande n’est pas disponible pour cette liste.');
    if (query.proformaId && kind !== 'orders')
      throw new BadRequestException('Le filtre par proforma est réservé aux commandes.');
    if (query.invoiceId && kind !== 'credit-notes')
      throw new BadRequestException('Le filtre par facture est réservé aux avoirs.');
    return this.repository.search(kind, actorId, query);
  }
}
