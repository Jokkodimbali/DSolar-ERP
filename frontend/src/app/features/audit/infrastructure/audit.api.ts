import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import {
  normalizeFilters,
  parseAuditPage,
  parseAuditSummary,
  type AuditFilters,
} from '../domain/audit.contract';

@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);
  private readonly base = apiPath('/audit');

  private params(filters: AuditFilters) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(normalizeFilters(filters))) {
      if (value) params = params.set(key, value);
    }
    return params;
  }

  list(filters: AuditFilters, cursor?: string) {
    const limit = 30;
    const normalized = normalizeFilters(filters);
    let params = this.params(normalized).set('limit', limit);
    if (cursor) params = params.set('cursor', storeId(cursor));
    return this.http
      .get<unknown>(this.base, { params })
      .pipe(map((value) => parseAuditPage(value, normalized, limit)));
  }

  summary(filters: AuditFilters) {
    return this.http
      .get<unknown>(this.base + '/summary', { params: this.params(filters) })
      .pipe(map(parseAuditSummary));
  }
}
