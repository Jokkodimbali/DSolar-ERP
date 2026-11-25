import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-empty">
      <strong>{{ heading() }}</strong>
      <p class="muted">{{ description() }}</p>
      <ng-content />
    </div>
  `,
})
export class EmptyStateComponent {
  readonly heading = input('Aucune donnée disponible');
  readonly description = input('Les résultats apparaîtront ici.');
}
