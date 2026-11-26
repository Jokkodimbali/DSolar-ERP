import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { finalize, map, shareReplay, type Observable } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { SessionService } from '../../auth/application/session.service';
import { parsePeriod } from '../domain/dashboard-period.contract';
import { parseOverview } from '../domain/dashboard.contract';

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private pending?: { epoch: number; result: Observable<unknown> };

  rawOverview(): Observable<unknown> {
    const epoch = this.session.sessionVersion();
    if (this.pending?.epoch === epoch) return this.pending.result;
    const result = this.http.get<unknown>(apiPath('/dashboard/overview')).pipe(
      finalize(() => {
        if (this.pending?.result === result) this.pending = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.pending = { epoch, result };
    return result;
  }

  period(month: string) {
    return this.http
      .get<unknown>(apiPath('/dashboard/period'), { params: { month } })
      .pipe(map((value) => parsePeriod(value, month)));
  }

  overview() {
    return this.rawOverview().pipe(map(parseOverview));
  }
}
