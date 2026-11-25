import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="ui-status" [class.ui-status-active]="active()">{{ active() ? activeLabel() : inactiveLabel() }}</span>
  `,
})
export class StatusBadgeComponent {
  readonly active = input.required<boolean>();
  readonly activeLabel = input('Actif');
  readonly inactiveLabel = input('Inactif');
}
