import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { parseReport, type ReportDefinition } from '../domain/dashboard-reports.contract';

@Injectable({ providedIn: 'root' })
export class DashboardReportsApi {
  private readonly http = inject(HttpClient);

  report(definition: ReportDefinition, year: number, limit: number) {
    let params = new HttpParams();
    if (definition.path === 'monthly-revenue') params = params.set('year', year);
    if (['top-products', 'recent-activity'].includes(definition.path)) params = params.set('limit', limit);
    return this.http
      .get<unknown>(apiPath('/dashboard/' + definition.path), { params })
      .pipe(map((value) => parseReport(value, definition, year)));
  }

  export(name: string) {
    if (!['receivables.csv', 'store-sales.csv', 'stock-valuation.csv'].includes(name))
      throw new Error('Export non autorisé.');
    return this.http.get(apiPath('/dashboard/exports/' + name), { responseType: 'blob' }).pipe(
      map((blob) => {
        if (!blob.type.toLowerCase().startsWith('text/csv')) throw new Error('Export invalide.');
        return blob;
      }),
    );
  }
}
