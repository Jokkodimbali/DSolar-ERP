import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { errorMessage } from '../../../../core/api/http-error';
import { ConfirmComponent } from '../../../../shared/ui/confirm.component';
import { FeedbackComponent } from '../../../../shared/ui/feedback.component';
import { PaginationComponent } from '../../../../shared/ui/pagination.component';
import { PageHeaderComponent } from '../../../../shared/ui/page-header.component';
import { SessionService } from '../../../auth/application/session.service';
import { formatMoney } from '../../../dashboard/domain/dashboard.contract';
import { cents } from '../../../treasury/domain/treasury.contract';
import {
  bankStorageKey,
  parseStatementInput,
  parseTabularLines,
  type BankAccount,
  type BankLine,
  type BankReport,
  type BankSuggestions,
  type Statement,
  type StatementInput,
  type parseAssetAccounts,
  type parseStatementPage,
} from '../domain/bank.contract';
import { BankApi } from '../infrastructure/bank.api';

type Action =
  | { kind: 'import'; input: StatementInput }
  | { kind: 'match' | 'unmatch'; lineId: string; ledgerLineId: string | null }
  | { kind: 'close' };

@Component({
  selector: 'app-bank-page',
  imports: [DatePipe, ConfirmComponent, FeedbackComponent, PageHeaderComponent, PaginationComponent],
  templateUrl: './bank.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankPage {
  private readonly api = inject(BankApi);
  private readonly session = inject(SessionService);
  private readonly destroy = inject(DestroyRef);
  readonly accounts = signal<BankAccount[]>([]);
  readonly assets = signal<ReturnType<typeof parseAssetAccounts>>([]);
  readonly availableAssets = computed(() =>
    this.assets().filter((asset) => !this.accounts().some((bank) => bank.accountId === asset.id)),
  );
  readonly selected = signal<BankAccount | null>(null);
  readonly statements = signal<ReturnType<typeof parseStatementPage> | null>(null);
  readonly report = signal<BankReport | null>(null);
  readonly suggestions = signal<BankSuggestions>([]);
  readonly query = signal('');
  readonly raw = signal('reference\tdate\tdescription\tmontant\n');
  readonly pending = signal<StatementInput | null>(null);
  readonly confirmation = signal<Action | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly blocked = signal(false);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly money = formatMoney;
  private storage: string | null = null;

  constructor() {
    try {
      const actor = this.session.user()?.id;
      if (actor && this.session.can('users.manage')) {
        this.storage = bankStorageKey(actor);
        const saved = sessionStorage.getItem(this.storage);
        if (saved !== null) this.pending.set(parseStatementInput(JSON.parse(saved)));
      }
    } catch {
      this.blocked.set(true);
      this.error.set('Impossible de récupérer le relevé en attente.');
    }
    this.load();
  }

  private permitted(): boolean {
    return (
      this.session.can('users.manage') &&
      !this.loading() &&
      !this.busy() &&
      !this.confirmation() &&
      !this.pending() &&
      !this.blocked()
    );
  }

  load(): void {
    if (this.loading() || this.busy() || this.confirmation()) return;
    this.loading.set(true);
    this.ready.set(false);
    this.selected.set(null);
    this.statements.set(null);
    this.report.set(null);
    this.suggestions.set([]);
    forkJoin({ accounts: this.api.accounts(), assets: this.api.assets() })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ accounts, assets }) => {
          this.accounts.set(accounts);
          this.assets.set(assets);
          this.ready.set(true);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  create(accountId: string, name: string): void {
    if (!this.permitted()) return;
    const normalized = name.trim();
    if (
      !normalized ||
      normalized.length > 160 ||
      !this.availableAssets().some((asset) => asset.id === accountId)
    ) {
      this.error.set('Compte d’actif disponible et nom de banque obligatoires.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    this.api
      .create(accountId, normalized)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.success.set('Compte bancaire enregistré.');
          this.load();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(errorMessage(error));
          this.load();
        },
      });
  }

  select(bank: BankAccount, page = 1, query = ''): void {
    if (this.loading() || this.busy() || this.confirmation()) return;
    this.selected.set(bank);
    this.report.set(null);
    this.suggestions.set([]);
    this.statements.set(null);
    this.query.set(query.trim());
    this.loading.set(true);
    this.api
      .statements(bank, page, this.query())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (items) => this.statements.set(items),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  inspect(statement: Statement): void {
    const bank = this.selected();
    if (!bank || this.loading() || this.busy() || this.confirmation()) return;
    this.loading.set(true);
    this.report.set(null);
    this.suggestions.set([]);
    this.api
      .detail(bank, statement)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (report) => this.report.set(report),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  suggest(): void {
    const report = this.report();
    if (!report || report.statement.closedAt || !this.permitted()) return;
    this.loading.set(true);
    this.suggestions.set([]);
    this.error.set('');
    this.api
      .suggestions(report)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (items) => this.suggestions.set(items),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  candidates(line: BankLine) {
    return (
      this.report()?.ledger.filter((item) => cents(item.debit) - cents(item.credit) === cents(line.amount)) ??
      []
    );
  }

  candidateAmount(item: BankReport['ledger'][number]): string {
    const value = cents(item.debit) - cents(item.credit);
    const abs = value < 0n ? -value : value;
    return (value < 0n ? '-' : '') + String(abs / 100n) + '.' + String(abs % 100n).padStart(2, '0');
  }

  suggestion(line: BankLine) {
    return this.suggestions().find((item) => item.id === line.id);
  }

  async readFile(input: HTMLInputElement): Promise<void> {
    if (!this.permitted()) return;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 400000) {
      this.error.set('Fichier trop volumineux (400 Ko maximum).');
      input.value = '';
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const raw = await file.text();
      parseTabularLines(raw);
      this.raw.set(raw);
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Fichier invalide.');
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }

  prepareImport(reference: string, start: string, end: string, opening: string, closing: string): void {
    const bank = this.selected();
    if (!bank || !this.permitted()) return;
    this.error.set('');
    this.success.set('');
    try {
      const input = parseStatementInput({
        bankAccountId: bank.id,
        reference: reference.trim(),
        start,
        end,
        opening: opening.trim().replace(',', '.'),
        closing: closing.trim().replace(',', '.'),
        lines: parseTabularLines(this.raw()),
      });
      this.confirmation.set({ kind: 'import', input });
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Relevé invalide.');
    }
  }

  askMatch(line: BankLine, ledgerLineId: string): void {
    if (!this.permitted() || this.report()?.statement.closedAt || line.ledgerLineId) return;
    if (
      !this.candidates(line).some((candidate) => candidate.id === ledgerLineId) &&
      !this.suggestion(line)?.candidates.some((candidate) => candidate.id === ledgerLineId)
    ) {
      this.error.set('Sélectionnez une écriture compatible.');
      return;
    }
    this.confirmation.set({ kind: 'match', lineId: line.id, ledgerLineId });
  }

  askUnmatch(line: BankLine): void {
    if (!this.permitted() || this.report()?.statement.closedAt || !line.ledgerLineId) return;
    this.confirmation.set({ kind: 'unmatch', lineId: line.id, ledgerLineId: null });
  }

  askClose(): void {
    const report = this.report();
    if (this.permitted() && report?.balanced && !report.statement.closedAt)
      this.confirmation.set({ kind: 'close' });
  }

  apply(): void {
    const action = this.confirmation();
    if (
      !action ||
      this.busy() ||
      this.loading() ||
      !this.session.can('users.manage') ||
      this.blocked() ||
      this.pending()
    )
      return;
    this.error.set('');
    this.success.set('');
    if (action.kind === 'import') {
      try {
        if (!this.storage) throw new Error('Session indisponible.');
        sessionStorage.setItem(this.storage, JSON.stringify(action.input));
        this.pending.set(action.input);
        this.confirmation.set(null);
        this.resume();
      } catch {
        this.error.set('Impossible de conserver le relevé. Aucun import envoyé.');
      }
      return;
    }
    const bank = this.selected();
    const report = this.report();
    if (!bank || !report || report.statement.closedAt) return;
    this.busy.set(true);
    const request =
      action.kind === 'close'
        ? this.api.close(bank, report)
        : this.api.match(bank, report, action.lineId, action.ledgerLineId);
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.confirmation.set(null);
        this.report.set(updated);
        this.suggestions.set([]);
        this.statements.update((page) =>
          page
            ? {
                ...page,
                items: page.items.map((item) =>
                  item.id === updated.statement.id ? updated.statement : item,
                ),
              }
            : null,
        );
        this.success.set(
          action.kind === 'close'
            ? 'Relevé clôturé.'
            : action.kind === 'match'
              ? 'Ligne rapprochée.'
              : 'Rapprochement annulé.',
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.confirmation.set(null);
        this.error.set(errorMessage(error) + ' Vérifiez le relevé avant de réessayer.');
        this.inspect(report.statement);
      },
    });
  }

  resume(): void {
    const input = this.pending();
    if (!input || this.loading() || this.busy() || this.blocked() || !this.session.can('users.manage'))
      return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .import(input)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.busy.set(false);
          try {
            if (this.storage) sessionStorage.removeItem(this.storage);
            this.pending.set(null);
            this.raw.set('reference\tdate\tdescription\tmontant\n');
            this.success.set('Relevé importé et vérifié.');
            const bank = this.accounts().find((item) => item.id === input.bankAccountId);
            if (bank) this.select(bank);
            else this.load();
          } catch {
            this.error.set('Relevé enregistré, mais demande locale non effacée.');
          }
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (error instanceof HttpErrorResponse && error.status === 400) {
            try {
              if (this.storage) sessionStorage.removeItem(this.storage);
              this.pending.set(null);
            } catch {
              /* Conserver la demande. */
            }
          }
          this.error.set(errorMessage(error) + ' En cas de résultat incertain, reprenez le même relevé.');
        },
      });
  }
}
