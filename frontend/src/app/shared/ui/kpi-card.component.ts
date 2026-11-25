import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { UiIconComponent, type UiIcon } from './ui-icon.component';

@Component({
  selector: 'app-kpi-card',
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="panel ui-kpi">
      <span class="ui-kpi-icon" [attr.data-tone]="tone()"><app-ui-icon [name]="icon()" /></span>
      <div class="ui-kpi-content">
        <span>{{ label() }}</span>
        <strong>{{ value() }}</strong>
        @if (variation(); as change) {
          <small class="kpi-comparison">
            <span class="kpi-delta" [class.negative]="change.startsWith('-')">
              {{ change.startsWith('-') ? '↘ ' : '↗ ' }}{{ change.replace('.', ',') }} %
            </span>
            <span>{{ description() }}</span>
          </small>
        } @else {
          <small>{{ description() }}</small>
        }
      </div>
    </article>
  `,
})
export class KpiCardComponent {
  readonly icon = input.required<UiIcon>();
  readonly tone = input<'pink' | 'blue' | 'orange' | 'green'>('pink');
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly description = input.required<string>();
  readonly variation = input<string | null>(null);
}
