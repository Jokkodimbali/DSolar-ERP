import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map } from 'rxjs';
import { apiPath } from '../../../../core/api/api-contract';
import { storeId } from '../../../stores/domain/store.contract';
import {
  parseAutomation,
  parseBalance,
  parseEntries,
  parsePending,
  parseSetup,
  parseStatements,
} from '../domain/ledger.contract';

@Injectable({ providedIn: 'root' })
export class LedgerApi {
  private readonly http = inject(HttpClient);
  private readonly base = apiPath('/accounting');

  setup() {
    return this.http.get<unknown>(this.base + '/setup').pipe(map(parseSetup));
  }

  private period(id: string) {
    return this.base + '/periods/' + storeId(id);
  }

  overview(id: string) {
    const path = this.period(id);
    return forkJoin({
      balance: this.http.get<unknown>(path + '/trial-balance').pipe(map(parseBalance)),
      statements: this.http.get<unknown>(path + '/statements').pipe(map((value) => parseStatements(value, id))),
      automation: this.http
        .get<unknown>(path + '/automation')
        .pipe(map((value) => parseAutomation(value, id))),
      pending: this.http.get<unknown>(path + '/pending').pipe(map((value) => parsePending(value, id))),
    });
  }

  entries(id: string, accountId?: string, cursor?: string) {
    const params: Record<string, string> = {};
    if (accountId) params['accountId'] = storeId(accountId);
    if (cursor) params['cursor'] = storeId(cursor);
    return this.http
      .get<unknown>(this.period(id) + '/entries', { params })
      .pipe(map((value) => parseEntries(value, id)));
  }
}
