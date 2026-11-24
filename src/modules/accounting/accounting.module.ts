import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { ACCOUNTING } from './application/accounting.port';
import { AccountingService } from './application/accounting.service';
import { AccountingRepository } from './infrastructure/accounting.repository';
import { AccountingController } from './presentation/accounting.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [AccountingController],
  providers: [AccountingService, { provide: ACCOUNTING, useClass: AccountingRepository }],
})
export class AccountingModule {}
