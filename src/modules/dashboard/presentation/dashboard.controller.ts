import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { DashboardService } from '../application/dashboard.service';

@ApiTags('Tableau de bord')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('recent-activity')
  @RequirePermissions('sales.read')
  recentActivity(@CurrentUserId() actorId: string, @Query('limit') limit?: string) {
    return this.dashboard.recentActivity(actorId, limit);
  }

  @Get('receivables')
  @RequirePermissions('sales.read')
  receivables(@CurrentUserId() actorId: string) {
    return this.dashboard.receivables(actorId);
  }

  @Get('monthly-revenue')
  @RequirePermissions('sales.read')
  monthlyRevenue(@CurrentUserId() actorId: string, @Query('year') year: string) {
    return this.dashboard.monthlyRevenue(actorId, year);
  }

  @Get('top-products')
  @RequirePermissions('sales.read')
  topProducts(@CurrentUserId() actorId: string, @Query('limit') limit?: string) {
    return this.dashboard.topProducts(actorId, limit);
  }

  @Get('overview')
  @RequirePermissions('sales.read')
  overview(@CurrentUserId() actorId: string) {
    return this.dashboard.overview(actorId);
  }
}
