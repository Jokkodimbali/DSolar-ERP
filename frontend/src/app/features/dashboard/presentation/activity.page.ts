import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { DashboardReportComponent } from './dashboard-report.component';
import { reports } from '../domain/dashboard-reports.contract';

@Component({
  selector: 'app-activity-page',
  imports: [DashboardReportComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      eyebrow="TABLEAU DE BORD"
      heading="Activité récente"
      description="Journal des opérations accessibles au super administrateur."
    />
    @if (report; as definition) {
      <app-dashboard-report [definition]="definition" />
    }
  `,
})
export class ActivityPage {
  readonly report = reports.find((entry) => entry.path === 'recent-activity');
}
