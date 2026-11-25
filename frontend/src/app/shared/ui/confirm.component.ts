import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" [attr.aria-label]="heading()">
      <h2>{{ heading() }}</h2>
      <p class="muted">{{ description() }}</p>
      <div class="ui-actions">
        <button type="button" class="primary" [disabled]="busy()" (click)="confirmed.emit()">
          {{ confirmLabel() }}
        </button>
        <button type="button" class="secondary" [disabled]="busy()" (click)="cancelled.emit()">
          Annuler
        </button>
      </div>
    </section>
  `,
})
export class ConfirmComponent {
  readonly heading = input.required<string>();
  readonly description = input.required<string>();
  readonly confirmLabel = input('Confirmer');
  readonly busy = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
