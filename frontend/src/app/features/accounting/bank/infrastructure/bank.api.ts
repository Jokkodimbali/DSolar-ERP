import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, switchMap } from 'rxjs';
import { apiPath } from '../../../../core/api/api-contract';
import { storeId } from '../../../stores/domain/store.contract';
import { parseAssetAccounts, parseBankAccount, parseBankAccounts, parseBankReport, parseStatements, parseSuggestions, verifyImported, type BankAccount, type BankReport, type Statement, type StatementInput } from '../domain/bank.contract';

@Injectable({ providedIn: 'root' })
export class BankApi {
  private readonly http = inject(HttpClient);
  private readonly base = apiPath('/accounting/bank');
  private statement(id: string) { return this.base + '/statements/' + storeId(id); }
  assets() { return this.http.get<unknown>(apiPath('/accounting/setup')).pipe(map(parseAssetAccounts)); }
  accounts() { return this.http.get<unknown>(this.base + '/accounts').pipe(map(parseBankAccounts)); }
  create(accountId: string, name: string) {
    return this.http.post<unknown>(this.base + '/accounts', { accountId: storeId(accountId), name }).pipe(map((value) => {
      const bank = parseBankAccount(value);
      if (bank.accountId !== accountId || bank.name !== name) throw new Error('Compte bancaire incohérent.');
      return bank;
    }));
  }
  statements(bank: BankAccount) {
    return this.http.get<unknown>(this.base + '/accounts/' + bank.id + '/statements').pipe(map((value) => parseStatements(value, bank.id)));
  }
  import(input: StatementInput) {
    return this.http.post<unknown>(this.base + '/statements', input).pipe(map((value) => verifyImported(value, input)));
  }
  detail(bank: BankAccount, statement: Statement) {
    return this.http.get<unknown>(this.statement(statement.id)).pipe(map((value) => parseBankReport(value, statement, bank.accountId)));
  }
  suggestions(report: BankReport) {
    return this.http.get<unknown>(this.statement(report.statement.id) + '/suggestions').pipe(map((value) => parseSuggestions(value, report)));
  }
  match(bank: BankAccount, report: BankReport, lineId: string, ledgerLineId: string | null) {
    const path = this.base + '/lines/' + storeId(lineId) + (ledgerLineId ? '/match' : '/unmatch');
    return this.http.post<unknown>(path, ledgerLineId ? { ledgerLineId: storeId(ledgerLineId) } : {}).pipe(
      switchMap(() => this.detail(bank, report.statement)),
      map((updated) => {
        const line = updated.lines.find((item) => item.id === lineId);
        if (!line || line.ledgerLineId !== ledgerLineId) throw new Error('Rapprochement non vérifié.');
        return updated;
      }),
    );
  }
  close(bank: BankAccount, report: BankReport) {
    return this.http.post<unknown>(this.statement(report.statement.id) + '/close', {}).pipe(
      switchMap(() => this.detail(bank, report.statement)),
      map((updated) => {
        if (!updated.statement.closedAt || !updated.balanced) throw new Error('Clôture non vérifiée.');
        return updated;
      }),
    );
  }
}
