import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
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

  @Get('exports/receivables.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="receivables.csv"')
  @RequirePermissions('sales.read')
  exportReceivablesCsv(@CurrentUserId() actorId: string) {
    return this.dashboard.exportReceivablesCsv(actorId);
  }

  @Get('exports/store-sales.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="store-sales.csv"')
  @RequirePermissions('sales.read')
  exportStoreSalesCsv(@CurrentUserId() actorId: string) {
    return this.dashboard.exportStoreSalesCsv(actorId);
  }

  @Get('exports/stock-valuation.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="stock-valuation.csv"')
  @RequirePermissions('sales.read')
  exportStockValuationCsv(@CurrentUserId() actorId: string) {
    return this.dashboard.exportStockValuationCsv(actorId);
  }

  @Get('stock-valuation')
  @RequirePermissions('sales.read')
  stockValuation(@CurrentUserId() actorId: string) {
    return this.dashboard.stockValuation(actorId);
  }

  @Get('procurement')
  @RequirePermissions('sales.read')
  procurement(@CurrentUserId() actorId: string) {
    return this.dashboard.procurement(actorId);
  }

  @Get('store-sales')
  @RequirePermissions('sales.read')
  storeSales(@CurrentUserId() actorId: string) {
    return this.dashboard.storeSales(actorId);
  }

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

  @Get('period')
  @RequirePermissions('sales.read')
  period(@CurrentUserId() actorId: string, @Query('month') month: string) {
    return this.dashboard.period(actorId, month);
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
