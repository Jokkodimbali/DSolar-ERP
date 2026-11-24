import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { COMMERCIAL_SEARCH, CommercialCriteria, CommercialKind, CommercialSearchPort } from './commercial-search.port';

const statuses: Record<CommercialKind, readonly string[]> = {
  customers: [],
  proformas: ['DRAFT', 'ISSUED', 'ACCEPTED', 'CANCELLED', 'EXPIRED'],
  orders: ['DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'],
  invoices: ['DRAFT', 'ISSUED', 'CANCELLED'],
};

@Injectable()
export class CommercialSearchService {
  constructor(@Inject(COMMERCIAL_SEARCH) private readonly repository: CommercialSearchPort) {}
  search(kind: CommercialKind, actorId: string, query: CommercialCriteria) {
    if (query.status && !statuses[kind].includes(query.status))
      throw new BadRequestException('Statut invalide pour ce type de document. Valeurs autorisées : ' + statuses[kind].join(', '));
    if (kind === 'customers' && (query.customerId || query.storeId || query.status))
      throw new BadRequestException('Ces filtres ne sont pas disponibles pour les clients.');
    return this.repository.search(kind, actorId, query);
  }
}
