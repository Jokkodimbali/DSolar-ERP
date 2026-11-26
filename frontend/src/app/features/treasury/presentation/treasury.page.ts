import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin, of } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { SessionService } from '../../auth/application/session.service';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';
import type { parseStores } from '../../stores/domain/store.contract';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import {
  cashInput,
  cashStorageKey,
  cents,
  parseCashCommand,
  type CashCandidate,
  type CashCommand,
  type CashMovement,
  type CashRegister,
  type CashSession,
  type CashSummary,
  type parseCandidates,
  type parseMovementPage,
  type parseSessionPage,
} from '../domain/treasury.contract';
import { TreasuryApi } from '../infrastructure/treasury.api';

type Action =
  | CashCommand
  | { kind: 'close'; session: CashSession; amount: string }
  | { kind: 'open'; register: CashRegister; amount: string };

@Component({
  selector: 'app-treasury-page',
  imports: [
    DatePipe,
    RouterLink,
    ConfirmComponent,
    FeedbackComponent,
    PageHeaderComponent,
    PaginationComponent,
  ],
  templateUrl: './treasury.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreasuryPage {
  private readonly api = inject(TreasuryApi);
  private readonly storesApi = inject(StoresApi);
  private readonly destroy = inject(DestroyRef);
  private readonly auth = inject(SessionService);
  readonly allowed = computed(() => this.auth.can('users.manage', 'sales.manage'));
  readonly registers = signal<CashRegister[]>([]);
  readonly stores = signal<ReturnType<typeof parseStores>>([]);
  readonly activeStores = computed(() => this.stores().filter((item) => item.status === 'ACTIVE'));
  readonly register = signal<CashRegister | null>(null);
  readonly sessions = signal<ReturnType<typeof parseSessionPage> | null>(null);
  readonly session = signal<CashSession | null>(null);
  readonly summary = signal<CashSummary | null>(null);
  readonly movements = signal<ReturnType<typeof parseMovementPage> | null>(null);
  readonly candidates = signal<ReturnType<typeof parseCandidates> | null>(null);
  readonly movementSearch = signal('');
  readonly candidateSearch = signal('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly ready = signal(false);
  readonly blocked = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly pending = signal<CashCommand | null>(null);
  readonly confirmation = signal<Action | null>(null);
  readonly money = formatMoney;
  readonly destinations = computed(() =>
    this.registers().filter((item) => item.open && item.open.id !== this.session()?.id),
  );
  private storage: string | null = null;

  constructor() {
    const actor = this.auth.user()?.id;
    if (actor && this.allowed()) {
      try {
        this.storage = cashStorageKey(actor);
        const saved = sessionStorage.getItem(this.storage);
        if (saved !== null) this.pending.set(parseCashCommand(JSON.parse(saved)));
      } catch {
        this.blocked.set(true);
        this.error.set('Impossible de récupérer le mouvement en attente.');
      }
    }
    this.load();
  }

  storeName(id: string): string {
    return this.stores().find((store) => store.id === id)?.name ?? id;
  }

  load(): void {
    if (this.loading() || this.busy() || this.confirmation()) return;
    this.ready.set(false);
    this.loading.set(true);
    this.register.set(null);
    this.sessions.set(null);
    this.clearSession();
    forkJoin({ registers: this.api.registers(), stores: this.storesApi.list() })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ registers, stores }) => {
          this.registers.set(registers);
          this.stores.set(stores);
          this.ready.set(true);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  private clearSession(): void {
    this.session.set(null);
    this.summary.set(null);
    this.movements.set(null);
    this.candidates.set(null);
    this.movementSearch.set('');
    this.candidateSearch.set('');
  }

  select(register: CashRegister, page = 1): void {
    if (this.loading() || this.busy() || this.confirmation()) return;
    this.clearSession();
    this.register.set(register);
    this.sessions.set(null);
    this.loading.set(true);
    this.api
      .sessions(register.id, page)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (data) => this.sessions.set(data),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  inspect(session: CashSession): void {
    if (this.loading() || this.busy() || this.confirmation()) return;
    this.clearSession();
    this.session.set(session);
    this.details();
  }

  details(movementPage = 1, candidatePage = 1): void {
    const session = this.session();
    if (!session || this.loading() || this.busy() || this.confirmation()) return;
    this.loading.set(true);
    this.summary.set(null);
    this.movements.set(null);
    this.candidates.set(null);
    forkJoin({
      summary: this.api.summary(session.id),
      movements: this.api.movements(session.id, movementPage, this.movementSearch()),
      candidates: session.closedAt
        ? of(null)
        : this.api.candidates(session.id, candidatePage, this.candidateSearch()),
    })
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (data) => {
          if (data.summary.closedAt !== session.closedAt) {
            this.error.set('La session a changé. Actualisez les caisses.');
            return;
          }
          this.summary.set(data.summary);
          this.movements.set(data.movements);
          this.candidates.set(data.candidates);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  create(store: string, name: string): void {
    if (!this.canAct() || !this.ready()) return;
    const value = name.trim();
    if (!this.activeStores().some((item) => item.id === store) || !value || value.length > 100) {
      this.error.set('Magasin actif et nom de caisse obligatoires.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    this.api
      .create(store, value)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => this.complete('Caisse créée.'),
        error: (error: unknown) => this.failed(error),
      });
  }

  private canAct(): boolean {
    return (
      this.allowed() &&
      !this.loading() &&
      !this.busy() &&
      !this.confirmation() &&
      !this.pending() &&
      !this.blocked()
    );
  }

  askOpen(register: CashRegister, amount: string): void {
    if (
      !this.canAct() ||
      register.open ||
      !this.activeStores().some((store) => store.id === register.storeId)
    )
      return;
    this.prepare(() => ({ kind: 'open', register, amount: cashInput(amount, false, true) }));
  }

  askClose(amount: string): void {
    const session = this.session();
    if (!session || session.closedAt || !this.summary() || !this.canAct()) return;
    this.prepare(() => ({ kind: 'close', session, amount: cashInput(amount, false, true) }));
  }

  askMove(value: string, reason: string): void {
    this.askCash('move', { amount: value.trim().replace(',', '.'), reason });
  }

  askTransfer(value: string, destinationId: string): void {
    if (!this.destinations().some((item) => item.open?.id === destinationId)) {
      this.error.set('Sélectionnez une autre caisse ouverte.');
      return;
    }
    this.askCash('transfer', { amount: value.trim().replace(',', '.'), destinationId });
  }

  askReverse(movement: CashMovement, reason: string): void {
    if (!movement.reversible || movement.sessionId !== this.session()?.id) return;
    const amount = movement.amount.startsWith('-') ? movement.amount.slice(1) : '-' + movement.amount;
    this.askCash('reverse', { amount, movementId: movement.id, reason });
  }

  askReconcile(payment: CashCandidate): void {
    if (!this.candidates()?.items.some((item) => item.id === payment.id)) return;
    this.askCash('reconcile', { amount: payment.amount, paymentId: payment.id });
  }

  private askCash(kind: CashCommand['kind'], values: Record<string, string>): void {
    const session = this.session();
    const summary = this.summary();
    if (!session || session.closedAt || !summary || !this.canAct()) return;
    this.prepare(() => {
      const command = parseCashCommand({
        ...values,
        kind,
        sessionId: session.id,
        operationKey: crypto.randomUUID(),
      });
      const delta = cents(command.amount) * (command.kind === 'transfer' ? -1n : 1n);
      if (cents(summary.expected) + delta < 0n) throw new Error('Solde de caisse insuffisant.');
      return command;
    });
  }

  private prepare(factory: () => Action): void {
    this.error.set('');
    this.success.set('');
    try {
      this.confirmation.set(factory());
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Opération invalide.');
    }
  }

  apply(): void {
    const action = this.confirmation();
    if (!action || this.busy() || this.loading() || !this.allowed() || this.blocked() || this.pending())
      return;
    if (action.kind === 'open' || action.kind === 'close') {
      this.busy.set(true);
      const request =
        action.kind === 'open'
          ? this.api.open(action.register.id, action.amount)
          : this.api.close(action.session, action.amount);
      request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: () => this.complete(action.kind === 'open' ? 'Session ouverte.' : 'Session clôturée.'),
        error: (error: unknown) => this.failed(error),
      });
      return;
    }
    try {
      if (!this.storage) throw new Error('Session indisponible.');
      sessionStorage.setItem(this.storage, JSON.stringify(action));
      this.pending.set(action);
      this.confirmation.set(null);
      this.resume();
    } catch {
      this.error.set('Impossible de conserver la demande. Aucun mouvement envoyé.');
    }
  }

  resume(): void {
    const command = this.pending();
    if (!command || !this.allowed() || this.blocked() || this.busy() || this.loading()) return;
    this.error.set('');
    this.busy.set(true);
    this.api
      .execute(command)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.busy.set(false);
          try {
            if (this.storage) sessionStorage.removeItem(this.storage);
            this.pending.set(null);
            this.complete('Mouvement enregistré et vérifié.');
          } catch {
            this.error.set('Mouvement enregistré, mais demande locale non effacée.');
          }
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(errorMessage(error) + ' Reprenez la même demande pour vérifier son résultat.');
          this.load();
        },
      });
  }

  private complete(message: string): void {
    this.busy.set(false);
    this.confirmation.set(null);
    this.success.set(message);
    this.load();
  }

  private failed(error: unknown): void {
    this.busy.set(false);
    this.confirmation.set(null);
    this.error.set(errorMessage(error) + ' Vérifiez la situation avant de réessayer.');
    this.load();
  }
}
