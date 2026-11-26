import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SessionService } from '../../auth/application/session.service';
import {
  blankCompany,
  companyFields,
  companyInput,
  type CompanyField,
  type CompanySettings,
} from '../domain/company.contract';
import { CompanySettingsApi } from '../infrastructure/company-settings.api';

@Component({
  selector: 'app-company-settings',
  imports: [ConfirmComponent, FeedbackComponent, PageHeaderComponent],
  templateUrl: './company-settings.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanySettingsPage {
  private readonly api = inject(CompanySettingsApi);
  private readonly destroy = inject(DestroyRef);
  private readonly session = inject(SessionService);
  readonly saved = signal<CompanySettings | null>(null);
  readonly draft = signal(blankCompany());
  readonly pending = signal<CompanySettings | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly dirty = computed(() => JSON.stringify(this.saved()?.input) !== JSON.stringify(this.draft()));
  readonly groups = [
    { label: 'Identité de l’entreprise', fields: companyFields.filter((field) => field.group === 'identity') },
    { label: 'Coordonnées', fields: companyFields.filter((field) => field.group === 'contact') },
    { label: 'Documents commerciaux', fields: companyFields.filter((field) => field.group === 'documents') },
    { label: 'Préférences', fields: companyFields.filter((field) => field.group === 'preferences') },
  ];

  constructor() {
    this.load();
  }

  load(): void {
    if (this.busy() || this.pending() || !this.session.can('users.manage')) return;
    this.busy.set(true);
    this.error.set('');
    this.saved.set(null);
    this.draft.set(blankCompany());
    this.api
      .current()
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (value) => {
          this.saved.set(value);
          this.draft.set(value.input);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  field(key: CompanyField, value: string): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
  }

  thresholdChange(value: number): void {
    this.draft.update((draft) => ({ ...draft, lowStockThreshold: value }));
  }

  notificationsChange(value: boolean): void {
    this.draft.update((draft) => ({ ...draft, notificationsEnabled: value }));
  }

  removeLogo(): void {
    this.draft.update((draft) => ({ ...draft, logoUrl: '' }));
  }

  upload(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.ready()) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024 || !file.size) {
      this.error.set('Sélectionnez une image PNG ou JPEG de 2 Mo maximum.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    this.api
      .upload(file)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (logoUrl) => {
          this.draft.update((draft) => ({ ...draft, logoUrl }));
          this.success.set('Logo téléversé. Enregistrez les paramètres pour l’utiliser.');
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  private ready(): boolean {
    return !!this.saved() && !this.busy() && !this.pending() && this.session.can('users.manage');
  }

  prepare(): void {
    const saved = this.saved();
    if (!saved || !this.ready() || !this.dirty()) return;
    this.error.set('');
    this.success.set('');
    try {
      this.pending.set({ revision: saved.revision, input: companyInput(this.draft()) });
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Paramètres invalides.');
    }
  }

  save(): void {
    const pending = this.pending();
    if (!pending || this.busy() || !this.session.can('users.manage')) return;
    this.busy.set(true);
    this.api
      .save(pending)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (saved) => {
          this.saved.set(saved);
          this.draft.set(saved.input);
          this.pending.set(null);
          this.success.set('Paramètres de l’entreprise enregistrés.');
        },
        error: (error: unknown) => {
          this.pending.set(null);
          this.error.set(errorMessage(error) + ' Rechargez la dernière version avant une nouvelle tentative.');
        },
      });
  }

  reset(): void {
    const saved = this.saved();
    if (saved && this.ready()) this.draft.set(saved.input);
  }
}
