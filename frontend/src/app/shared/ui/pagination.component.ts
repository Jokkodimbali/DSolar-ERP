import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="ui-pagination" aria-label="Pagination des résultats">
      <button type="button" class="secondary" [disabled]="disabled() || page() <= 1" (click)="change.emit(page() - 1)">
        Précédent
      </button>
      <span aria-live="polite">Page {{ page() }} / {{ pages() }}</span>
      <button type="button" class="secondary" [disabled]="disabled() || page() >= pages()" (click)="change.emit(page() + 1)">
        Suivant
      </button>
    </nav>
  `,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly pages = input.required<number>();
  readonly disabled = input(false);
  readonly change = output<number>();
}
