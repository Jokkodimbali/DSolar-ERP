import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type UiIcon = 'home' | 'dashboard' | 'store' | 'user' | 'menu' | 'trend' | 'box' | 'wallet';

const paths: Record<UiIcon, string> = {
  home: 'M3 10 12 3l9 7v10H3z M9 20v-7h6v7',
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  store: 'M4 10v11h16V10 M3 10l2-7h14l2 7 M3 10c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0 M10 21v-6h4v6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  trend: 'm3 17 6-6 4 4 7-9 M15 6h5v5 M3 21h18',
  box: 'm12 3 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9 M7.5 5.5l9 5',
  wallet: 'M3 6h18v14H3z M3 6l15-3v3 M21 11h-7v4h7',
};

@Component({
  selector: 'app-ui-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path [attr.d]="paths[name()]" />
    </svg>
  `,
})
export class UiIconComponent {
  readonly name = input.required<UiIcon>();
  readonly paths = paths;
}
