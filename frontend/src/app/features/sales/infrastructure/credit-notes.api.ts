import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import {
  parseCreditNotes,
  parseCreditPage,
  parseCreditPreview,
  verifyIssuedCredit,
  type CreditCommand,
  type CreditLineInput,
} from '../domain/credit-note.contract';

@Injectable({ providedIn: 'root' })
export class CreditNotesApi {
  private readonly http = inject(HttpClient);
  private path(invoiceId: string) {
    return apiPath('/invoices/' + storeId(invoiceId) + '/credit-notes');
  }
  search(page: number, search: string) {
    return this.http
      .get<unknown>(apiPath('/credit-notes/search'), { params: { page, limit: 10, search } })
      .pipe(map(parseCreditPage));
  }
  list(invoiceId: string) {
    return this.http
      .get<unknown>(this.path(invoiceId))
      .pipe(map((value) => parseCreditNotes(value, invoiceId)));
  }
  preview(invoiceId: string, lines: CreditLineInput[]) {
    return this.http
      .post<unknown>(this.path(invoiceId) + '/preview', { lines })
      .pipe(map((value) => parseCreditPreview(value, invoiceId, lines)));
  }
  issue(invoiceId: string, command: CreditCommand) {
    return this.http
      .post<unknown>(this.path(invoiceId), command)
      .pipe(map((value) => verifyIssuedCredit(value, invoiceId, command)));
  }
}
