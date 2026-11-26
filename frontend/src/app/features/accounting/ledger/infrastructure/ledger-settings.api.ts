import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath, isRecord } from '../../../../core/api/api-contract';
import { storeId } from '../../../stores/domain/store.contract';
import { parseAutomation, parseSetup } from '../domain/ledger.contract';
import type { LedgerAction } from '../domain/ledger-settings.contract';

@Injectable({ providedIn: 'root' })
export class LedgerSettingsApi {
  private readonly http = inject(HttpClient);
  private readonly base = apiPath('/accounting');

  setup() {
    return this.http.get<unknown>(this.base + '/setup').pipe(map(parseSetup));
  }

  automation(id: string) {
    return this.http
      .get<unknown>(this.base + '/periods/' + storeId(id) + '/automation')
      .pipe(map((value) => parseAutomation(value, id)));
  }

  execute(action: LedgerAction) {
    const request = this.request(action);
    return this.http.post<unknown>(this.base + request.path, request.body).pipe(
      map((value) => {
        if (!isRecord(value)) throw new Error('Réponse de paramétrage invalide.');
        if (action.kind === 'close' && (value['id'] !== action.id || !value['closedAt']))
          throw new Error('Clôture non vérifiée.');
        if (action.kind === 'automation' && (value['periodId'] !== action.id || value['enabled'] !== true))
          throw new Error('Activation non vérifiée.');
        return value;
      }),
    );
  }

  private request(action: LedgerAction): { path: string; body: object } {
    switch (action.kind) {
      case 'accounts':
      case 'journals':
        return { path: '/' + action.kind, body: { code: action.code, name: action.name } };
      case 'periods':
        return { path: '/periods', body: { name: action.name, start: action.start, end: action.end } };
      case 'classify':
        return { path: '/accounts/' + storeId(action.id) + '/classify', body: { category: action.category } };
      case 'rules': {
        return {
          path: '/rules',
          body: {
            key: action.key,
            journalId: action.journalId,
            debitAccountId: action.debitAccountId,
            creditAccountId: action.creditAccountId,
            ...(action.taxAccountId ? { taxAccountId: action.taxAccountId } : {}),
          },
        };
      }
      case 'automation':
      case 'close':
      case 'post-pending':
        return {
          path: '/periods/' + storeId(action.id) + '/' + action.kind,
          body: action.kind === 'automation' ? { enabled: true } : {},
        };
    }
  }
}
