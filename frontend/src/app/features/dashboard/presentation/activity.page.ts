import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DashboardReportComponent } from './dashboard-report.component';
import { reports } from '../domain/dashboard-reports.contract';

@Component({
  selector: 'app-activity-page',
  imports: [DashboardReportComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Activité récente</h1>
    <p class="muted">Journal des opérations accessibles au super administrateur.</p>
    @if (report; as definition) {
      <app-dashboard-report [definition]="definition" />
    }
  `,
})
export class ActivityPage {
  readonly report = reports.find((entry) => entry.path === 'recent-activity');
}
