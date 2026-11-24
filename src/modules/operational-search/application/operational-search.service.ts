import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { OPERATIONAL_SEARCH, OperationalCriteria, OperationalKind, OperationalSearchPort } from './operational-search.port';

const statuses: Record<OperationalKind, readonly string[]> = {
  stores: ['ACTIVE', 'INACTIVE'],
  users: ['ACTIVE', 'DISABLED'],
  stocks: [],
  transfers: ['DRAFT', 'APPROVED', 'SHIPPED', 'RECEIVED', 'CLOSED_WITH_DISCREPANCY', 'CANCELLED'],
  counts: ['DRAFT', 'VALIDATED', 'CANCELLED'],
  expenses: ['DRAFT', 'APPROVED', 'PAID', 'CANCELLED', 'REFUNDED'],
  returns: ['DRAFT', 'CONFIRMED', 'CANCELLED'],
  registers: [],
  entries: ['POSTED', 'DRAFT'],
  'bank-statements': ['OPEN', 'CLOSED'],
};

@Injectable()
export class OperationalSearchService {
  constructor(@Inject(OPERATIONAL_SEARCH) private readonly repository: OperationalSearchPort) {}
  search(kind: OperationalKind, actorId: string, query: OperationalCriteria) {
    if (query.status && !statuses[kind].includes(query.status))
      throw new BadRequestException('Statut non autorisé pour cette liste.');
    if (query.periodId && kind !== 'entries')
      throw new BadRequestException('Le filtre par période est réservé aux écritures comptables.');
    if (query.storeId && ['users', 'entries', 'bank-statements'].includes(kind))
      throw new BadRequestException('Le filtre par magasin n’est pas disponible pour cette liste.');
    return this.repository.search(kind, actorId, query);
  }
}
