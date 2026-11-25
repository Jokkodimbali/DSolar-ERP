import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { UiIconComponent } from './ui-icon.component';

@Component({
  selector: 'app-empty-state',
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-empty">
      <span class="ui-empty-icon"><app-ui-icon name="box" /></span>
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
