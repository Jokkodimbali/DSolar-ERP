import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { SalesReportService } from '../application/sales-report.service';

@ApiTags('Rapports commerciaux')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('sales/reports')
export class SalesReportController {
  constructor(private readonly reports: SalesReportService) {}

  @Get('summary')
  @RequirePermissions('sales.read')
  summary(@CurrentUserId() actorId: string) {
    return this.reports.summary(actorId);
  }
}
