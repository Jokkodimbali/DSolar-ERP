import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { DASHBOARD_REPOSITORY } from './application/dashboard.port';
import { DashboardService } from './application/dashboard.service';
import { PrismaDashboardRepository } from './infrastructure/prisma-dashboard.repository';
import { DashboardController } from './presentation/dashboard.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [DashboardController],
  providers: [DashboardService, { provide: DASHBOARD_REPOSITORY, useClass: PrismaDashboardRepository }],
})
export class DashboardModule {}
