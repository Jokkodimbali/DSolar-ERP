import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, forkJoin, map, of } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { errorMessage } from '../../../core/api/http-error';
import { SessionService } from '../../auth/application/session.service';
import { parseSearch, sources, type SearchGroup } from '../domain/search.contract';

@Injectable({ providedIn: 'root' })
export class SearchApi {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);

  search(query: string) {
    const authorized = sources.filter((source) => this.session.can(source.permission));
    if (!authorized.length) return of<SearchGroup[]>([]);
    return forkJoin(
      authorized.map((source) =>
        this.http
          .get<unknown>(apiPath(source.path), { params: { search: query, page: 1, limit: 5 } })
          .pipe(
            map((value) => parseSearch(value, source)),
            catchError((error: unknown) =>
              of<SearchGroup>({ label: source.label, items: [], total: 0, error: errorMessage(error) }),
            ),
          ),
      ),
    );
  }
}
