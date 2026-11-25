import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { parsePage, parseTransfer, parseTransferDetail, parseCount, parseCountDetail, parseId, type TransferInput, type ReceiptInput, type CountInput } from '../domain/workflow.contract';

@Injectable({ providedIn: 'root' })
export class StockWorkflowsApi {
  private readonly http = inject(HttpClient);
  private transfer(id: string) { return apiPath('/inventory/transfers/' + storeId(id)); }
  private count(id: string) { return apiPath('/inventory/counts/' + storeId(id)); }
  transfers(id: string, page: number, search: string) {
    return this.http.get<unknown>(apiPath('/inventory/transfers/stores/' + storeId(id) + '/search'), { params: { page, limit: 10, search } }).pipe(map((value) => parsePage(value, parseTransfer)));
  }
  counts(id: string, page: number, search: string) {
    return this.http.get<unknown>(apiPath('/inventory/counts/stores/' + storeId(id) + '/search'), { params: { page, limit: 10, search } }).pipe(map((value) => parsePage(value, parseCount)));
  }
  transferDetail(id: string) { return this.http.get<unknown>(this.transfer(id)).pipe(map(parseTransferDetail)); }
  countDetail(id: string) { return this.http.get<unknown>(this.count(id)).pipe(map(parseCountDetail)); }
  createTransfer(input: TransferInput) { return this.http.post<unknown>(apiPath('/inventory/transfers'), input).pipe(map(parseId)); }
  transferAction(id: string, action: 'approve' | 'ship' | 'cancel') { return this.http.post<unknown>(this.transfer(id) + '/' + action, {}); }
  receive(id: string, input: ReceiptInput) { return this.http.post<unknown>(this.transfer(id) + '/receive', input); }
  startCount(id: string) { return this.http.post<unknown>(apiPath('/inventory/counts/stores/' + storeId(id)), {}).pipe(map(parseId)); }
  record(id: string, lines: CountInput[]) { return this.http.post<unknown>(this.count(id) + '/lines', { lines }); }
  countAction(id: string, action: 'validate' | 'cancel') { return this.http.post<unknown>(this.count(id) + '/' + action, {}); }
}
