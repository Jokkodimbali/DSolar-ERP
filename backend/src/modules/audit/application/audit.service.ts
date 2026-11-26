import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditRepository } from '../infrastructure/audit.repository';

export interface AuditFilters {
  limit?: string;
  cursor?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  storeId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  list(actorId: string, filters: AuditFilters) {
    const limit = filters.limit === undefined ? 30 : Number(filters.limit);
    if (
      filters.limit !== undefined &&
      (typeof filters.limit !== 'string' || !/^\d{1,3}$/.test(filters.limit))
    )
      throw new BadRequestException('Limite de journal invalide.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException('La limite doit être un entier entre 1 et 100.');
    for (const value of [filters.entityType, filters.entityId, filters.action]) {
      if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 120))
        throw new BadRequestException('Filtre de journal invalide.');
    }
    const from = this.parseDate(filters.from, 'from');
    const to = this.parseDate(filters.to, 'to');
    if (from && to && from > to)
      throw new BadRequestException('La date de début doit précéder la date de fin.');
    return this.repository.list(actorId, {
      limit,
      actorId: filters.actorId,
      cursor: filters.cursor,
      entityType: filters.entityType?.trim(),
      entityId: filters.entityId?.trim(),
      action: filters.action?.trim(),
      storeId: filters.storeId,
      from,
      to,
    });
  }

  summary(actorId: string, filters: Omit<AuditFilters, 'limit' | 'cursor'>) {
    const from = this.parseDate(filters.from, 'from');
    const to = this.parseDate(filters.to, 'to');
    if (from && to && from > to)
      throw new BadRequestException('La date de début doit précéder la date de fin.');
    for (const value of [filters.entityType, filters.entityId, filters.action]) {
      if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 120))
        throw new BadRequestException('Filtre de journal invalide.');
    }
    return this.repository.summary(actorId, {
      limit: 1,
      actorId: filters.actorId,
      entityType: filters.entityType?.trim(),
      entityId: filters.entityId?.trim(),
      action: filters.action?.trim(),
      storeId: filters.storeId,
      from,
      to,
    });
  }

  private parseDate(value: string | undefined, field: string): Date | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new BadRequestException(`Le filtre ${field} doit être au format AAAA-MM-JJ.`);
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
      throw new BadRequestException(`Le filtre ${field} contient une date invalide.`);
    return date;
  }
}
