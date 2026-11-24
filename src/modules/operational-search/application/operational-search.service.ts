import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  OPERATIONAL_SEARCH,
  OperationalCriteria,
  OperationalKind,
  OperationalSearchPort,
} from './operational-search.port';

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
  categories: [],
  brands: [],
  'tax-regimes': [],
  'price-history': ['ACTIVE', 'HISTORICAL'],
  'stock-movements': [
    'RECEIPT',
    'DELIVERY',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'INVENTORY_ADJUSTMENT',
    'RETURN_IN',
    'RETURN_OUT',
    'SITE_CONSUMPTION',
    'DAMAGE',
    'LOSS',
  ],
  accounts: [],
  journals: [],
  periods: ['OPEN', 'CLOSED'],
  'bank-accounts': [],
  'cash-sessions': ['OPEN', 'CLOSED'],
  'cash-movements': [],
  'bank-lines': ['MATCHED', 'UNMATCHED'],
};

@Injectable()
export class OperationalSearchService {
  constructor(@Inject(OPERATIONAL_SEARCH) private readonly repository: OperationalSearchPort) {}
  search(kind: OperationalKind, actorId: string, query: OperationalCriteria) {
    if (query.status && !statuses[kind].includes(query.status))
      throw new BadRequestException('Statut non autorisé pour cette liste.');
    if (query.periodId && kind !== 'entries')
      throw new BadRequestException('Le filtre par période est réservé aux écritures comptables.');
    if (
      query.storeId &&
      ![
        'stores',
        'stocks',
        'transfers',
        'counts',
        'expenses',
        'returns',
        'registers',
        'stock-movements',
        'cash-sessions',
        'cash-movements',
      ].includes(kind)
    )
      throw new BadRequestException('Le filtre par magasin n’est pas disponible pour cette liste.');
    const allowedFilters: [string | undefined, OperationalKind[], string][] = [
      [query.productId, ['stocks', 'stock-movements', 'price-history'], 'produit'],
      [query.registerId, ['cash-sessions', 'cash-movements'], 'caisse'],
      [query.sessionId, ['cash-movements'], 'session'],
      [query.statementId, ['bank-lines'], 'relevé bancaire'],
    ];
    for (const [value, allowed, label] of allowedFilters) {
      if (value && !allowed.includes(kind))
        throw new BadRequestException('Filtre par ' + label + ' indisponible pour cette liste.');
    }
    return this.repository.search(kind, actorId, query);
  }
}
