import { Inject, Injectable } from '@nestjs/common';
import { SALES_REPORT_REPOSITORY, SalesReportRepository } from './sales-report.port';

@Injectable()
export class SalesReportService {
  constructor(@Inject(SALES_REPORT_REPOSITORY) private readonly reports: SalesReportRepository) {}

  summary(actorId: string) {
    return this.reports.summary(actorId);
  }
}
