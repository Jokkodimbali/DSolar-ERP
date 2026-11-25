import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { parseOverview } from '../domain/dashboard.contract';
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);
  overview() {
    return this.http.get<unknown>(apiPath('/dashboard/overview')).pipe(map(parseOverview));
  }
}
