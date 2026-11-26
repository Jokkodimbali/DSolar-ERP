import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  PROCUREMENT_SEARCH,
  ProcurementCriteria,
  ProcurementKind,
  ProcurementSearchPort,
} from './procurement-search.port';
@Injectable()
export class ProcurementSearchService {
  constructor(@Inject(PROCUREMENT_SEARCH) private readonly repository: ProcurementSearchPort) {}
  search(kind: ProcurementKind, actor: string, query: ProcurementCriteria) {
    const statuses =
      kind === 'purchase-orders'
        ? ['DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED']
        : ['DRAFT', 'CONFIRMED', 'CANCELLED'];
    if (query.status && (kind === 'suppliers' || !statuses.includes(query.status)))
      throw new BadRequestException('Statut non autorisé pour cette liste.');
    if (
      (kind === 'suppliers' && (query.supplierId || query.storeId)) ||
      (kind !== 'suppliers' && query.active !== undefined) ||
      (kind === 'purchase-orders' && query.storeId)
    )
      throw new BadRequestException('Filtre non disponible pour cette liste.');
    if (query.outstanding !== undefined && kind !== 'purchase-orders')
      throw new BadRequestException(
        'Le filtre des commandes en attente est réservé aux commandes fournisseurs.',
      );
    if (query.outstanding && query.status && !['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(query.status))
      throw new BadRequestException(
        'Les commandes en attente doivent être confirmées ou partiellement réceptionnées.',
      );
    return this.repository.search(kind, actor, query);
  }
}
