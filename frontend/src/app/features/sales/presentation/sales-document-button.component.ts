import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { SessionService } from '../../auth/application/session.service';
import { documentFilename, type SalesDocument } from '../domain/sales-document.contract';
import { SalesDocumentsApi } from '../infrastructure/sales-documents.api';

@Component({
  selector: 'app-sales-document-button',
  imports: [FeedbackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="secondary"
      [disabled]="busy() || disabled() || !session.can('sales.read')"
      (click)="download()"
    >
      {{ busy() ? 'Téléchargement…' : label() }}
    </button>
    <app-feedback [message]="error()" kind="error" />
  `,
})
export class SalesDocumentButtonComponent {
  readonly document = input.required<SalesDocument>();
  readonly label = input('Télécharger le PDF');
  readonly disabled = input(false);
  readonly session = inject(SessionService);
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly api = inject(SalesDocumentsApi);
  private readonly destroy = inject(DestroyRef);
  private readonly dom = inject(DOCUMENT);

  download(): void {
    if (this.disabled() || this.busy() || !this.session.can('sales.read')) return;
    const document = this.document();
    const version = this.session.sessionVersion();
    this.error.set('');
    this.busy.set(true);
    this.api
      .download(document)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (blob) => {
          if (this.session.sessionVersion() !== version || !this.session.can('sales.read')) return;
          try {
            const url = URL.createObjectURL(blob);
            const anchor = this.dom.createElement('a');
            try {
              anchor.href = url;
              anchor.download = documentFilename(document);
              this.dom.body.appendChild(anchor);
              anchor.click();
            } finally {
              anchor.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
          } catch {
            this.error.set('Impossible d’enregistrer le document.');
          }
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }
}
