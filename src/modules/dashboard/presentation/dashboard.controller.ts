import { Controller, Get, UseGuards } from '@nestjs/common';
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

  @Get('overview')
  @RequirePermissions('sales.read')
  overview(@CurrentUserId() actorId: string) {
    return this.dashboard.overview(actorId);
  }
}
