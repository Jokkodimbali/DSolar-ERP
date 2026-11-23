import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditRepository } from '../infrastructure/audit.repository';

export interface AuditFilters {
  limit?: string;
  cursor?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  storeId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  list(actorId: string, filters: AuditFilters) {
    const limit = filters.limit === undefined ? 30 : Number(filters.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException('La limite doit être un entier entre 1 et 100.');
    for (const value of [filters.entityType, filters.entityId, filters.action]) {
      if (value !== undefined && (!value.trim() || value.length > 120))
        throw new BadRequestException('Filtre de journal invalide.');
    }
    return this.repository.list(actorId, {
      limit,
      cursor: filters.cursor,
      entityType: filters.entityType?.trim(),
      entityId: filters.entityId?.trim(),
      action: filters.action?.trim(),
      storeId: filters.storeId,
    });
  }
}
