import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { UiIconComponent } from '../../../shared/ui/ui-icon.component';
import type { PeriodStats } from '../domain/dashboard-period.contract';
import { revenueAxis, revenueChart } from '../domain/dashboard-reports.contract';

@Component({
  selector: 'app-period-chart',
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './period-chart.component.html',
})
export class PeriodChartComponent {
  readonly stats = input<PeriodStats | null>(null);
  readonly loading = input(false);
  readonly mode = signal<'revenue' | 'orders'>('revenue');

  readonly plot = computed(() => {
    const days = this.stats()?.days ?? [];
    if (this.mode() === 'revenue') {
      const amounts = days.map((day) => day.revenue);
      return {
        axis: revenueAxis(amounts),
        bars: revenueChart(amounts).map((bar, index) => ({ ...bar, label: String(index + 1) })),
      };
    }
    const maximum = days.reduce((max, day) => Math.max(max, day.orders), 0);
    const step = Math.ceil(maximum / 4);
    const peak = step * 4;
    return {
      axis: peak ? [4, 3, 2, 1, 0].map((n) => String(n * step)) : ['', '', '', '', '0'],
      bars: days.map((day) => ({
        label: String(day.day),
        amount: String(day.orders) + ' commande(s)',
        height: peak ? (day.orders / peak) * 100 : 0,
        negative: false,
      })),
    };
  });
  readonly empty = computed(() => this.plot().bars.every((bar) => bar.height === 0));
}
