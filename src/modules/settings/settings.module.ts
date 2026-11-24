import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { COMPANY_SETTINGS } from './application/company-settings.port';
import { CompanySettingsService } from './application/company-settings.service';
import { PrismaCompanySettingsRepository } from './infrastructure/prisma-company-settings.repository';
import { CompanySettingsController } from './presentation/company-settings.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [CompanySettingsController],
  providers: [
    CompanySettingsService,
    { provide: COMPANY_SETTINGS, useClass: PrismaCompanySettingsRepository },
  ],
})
export class SettingsModule {}
