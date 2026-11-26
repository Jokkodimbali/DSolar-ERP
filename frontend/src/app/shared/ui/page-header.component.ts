import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading">
      <div>
        <p class="eyebrow">{{ eyebrow() }}</p>
        <h1>{{ heading() }}</h1>
        <p class="muted">{{ description() }}</p>
      </div>
      <div class="ui-actions"><ng-content /></div>
    </div>
  `,
})
export class PageHeaderComponent {
  readonly eyebrow = input.required<string>();
  readonly heading = input.required<string>();
  readonly description = input.required<string>();
}
