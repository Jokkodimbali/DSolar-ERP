import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { parseRegisters, parseRegister, parseSession, parseSessionPage, parseSummary, parseMovementPage, parseCandidates, verifyCashCommand, cents, type CashCommand, type CashSession } from '../domain/treasury.contract';

@Injectable({ providedIn: 'root' })
export class TreasuryApi {
  private readonly http = inject(HttpClient);
  private readonly base = apiPath('/treasury');
  private register(id: string) { return this.base + '/registers/' + storeId(id); }
  private session(id: string) { return this.base + '/sessions/' + storeId(id); }
  registers() { return this.http.get<unknown>(this.base + '/registers').pipe(map(parseRegisters)); }
  create(store: string, name: string) {
    return this.http.post<unknown>(this.base + '/registers', { storeId: storeId(store), name }).pipe(map((value) => {
      const item = parseRegister(value);
      if (item.storeId !== store || item.name !== name) throw new Error('Caisse créée incohérente.');
      return item;
    }));
  }
  open(register: string, amount: string) {
    return this.http.post<unknown>(this.register(register) + '/open', { amount }).pipe(map((value) => {
      const session = parseSession(value, register);
      if (session.closedAt || cents(session.opening) !== cents(amount)) throw new Error('Session ouverte incohérente.');
      return session;
    }));
  }
  sessions(register: string, page: number) {
    return this.http.get<unknown>(this.register(register) + '/sessions', { params: { page, limit: 10 } }).pipe(map((value) => parseSessionPage(value, register)));
  }
  summary(id: string) { return this.http.get<unknown>(this.session(id) + '/summary').pipe(map((value) => parseSummary(value, id))); }
  movements(id: string, page: number, search: string) {
    return this.http.get<unknown>(this.session(id) + '/movements', { params: { page, limit: 20, search } }).pipe(map((value) => parseMovementPage(value, id)));
  }
  candidates(id: string, page: number, search: string) {
    return this.http.get<unknown>(this.session(id) + '/reconciliation-candidates', { params: { page, limit: 10, search } }).pipe(map(parseCandidates));
  }
  close(session: CashSession, amount: string) {
    return this.http.post<unknown>(this.session(session.id) + '/close', { amount }).pipe(map((value) => {
      const result = parseSession(value, session.registerId);
      if (result.id !== session.id || !result.closedAt || result.counted === null || cents(result.counted) !== cents(amount))
        throw new Error('Clôture non vérifiée.');
      return result;
    }));
  }
  execute(command: CashCommand) {
    const path = this.session(command.sessionId);
    const operationKey = command.operationKey;
    const request = command.kind === 'move'
      ? this.http.post<unknown>(path + '/movements', { operationKey, amount: command.amount, reason: command.reason })
      : command.kind === 'transfer'
        ? this.http.post<unknown>(path + '/transfer', { operationKey, amount: command.amount, destinationId: command.destinationId })
        : command.kind === 'reverse'
          ? this.http.post<unknown>(this.base + '/movements/' + storeId(command.movementId) + '/reverse', { operationKey, reason: command.reason })
          : this.http.post<unknown>(path + '/reconcile', { operationKey, paymentId: command.paymentId });
    return request.pipe(map((value) => verifyCashCommand(value, command)));
  }
}
