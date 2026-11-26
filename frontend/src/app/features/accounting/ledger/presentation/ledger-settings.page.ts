import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { errorMessage } from '../../../../core/api/http-error';
import { ConfirmComponent } from '../../../../shared/ui/confirm.component';
import { FeedbackComponent } from '../../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../../shared/ui/page-header.component';
import { SessionService } from '../../../auth/application/session.service';
import type { parseSetup } from '../domain/ledger.contract';
import {
  classes,
  classificationAction,
  codeAction,
  periodAction,
  ruleAction,
  type LedgerAction,
} from '../domain/ledger-settings.contract';
import { LedgerSettingsApi } from '../infrastructure/ledger-settings.api';

@Component({
  selector: 'app-ledger-settings',
  imports: [RouterLink, ConfirmComponent, FeedbackComponent, PageHeaderComponent],
  templateUrl: './ledger-settings.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LedgerSettingsPage {
  private readonly api = inject(LedgerSettingsApi);
  private readonly session = inject(SessionService);
  private readonly destroy = inject(DestroyRef);
  readonly setup = signal<ReturnType<typeof parseSetup> | null>(null);
  readonly busy = signal(false);
  readonly pending = signal<LedgerAction | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly classes = classes;

  constructor() {
    this.load();
  }

  load(): void {
    if (this.busy() || this.pending() || !this.session.can('users.manage')) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .setup()
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (value) => this.setup.set(value),
        error: (error: unknown) => {
          this.setup.set(null);
          this.error.set(errorMessage(error));
        },
      });
  }

  private prepare(factory: () => LedgerAction): void {
    if (!this.setup() || this.busy() || this.pending() || !this.session.can('users.manage')) return;
    this.error.set('');
    this.success.set('');
    try {
      this.pending.set(factory());
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Données invalides.');
    }
  }

  code(kind: 'accounts' | 'journals', code: string, name: string): void {
    this.prepare(() => codeAction(kind, code, name));
  }

  classify(id: string, category: string): void {
    this.prepare(() => classificationAction(id, category));
  }

  period(name: string, start: string, end: string): void {
    this.prepare(() => periodAction(name, start, end));
  }

  rule(key: string, journal: string, debit: string, credit: string, tax: string): void {
    this.prepare(() => ruleAction(key, journal, debit, credit, tax));
  }

  periodOperation(kind: 'automation' | 'close' | 'post-pending', id: string): void {
    this.prepare(() => {
      if (!this.setup()?.periods.some((item) => item.id === id && !item.closedAt))
        throw new Error('Période ouverte requise.');
      return { kind, id };
    });
  }

  label(id: string | null): string {
    return this.setup()?.accounts.find((item) => item.id === id)?.code ?? '—';
  }

  confirm(): void {
    const action = this.pending();
    if (!action || this.busy() || !this.session.can('users.manage')) return;
    this.busy.set(true);
    this.api
      .execute(action)
      .pipe(
        switchMap(() => this.api.setup()),
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (setup) => {
          this.setup.set(setup);
          this.pending.set(null);
          this.success.set(
            action.kind === 'post-pending'
              ? 'Traitement demandé. Consultez les pièces restantes et les anomalies dans la comptabilité.'
              : 'Paramétrage enregistré. Les données ont été rechargées.',
          );
        },
        error: (error: unknown) => {
          this.pending.set(null);
          this.setup.set(null);
          this.error.set(errorMessage(error) + ' Actualisez avant toute nouvelle tentative.');
        },
      });
  }
}
