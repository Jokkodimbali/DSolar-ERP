import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { ACCOUNTING } from './application/accounting.port';
import { AccountingService } from './application/accounting.service';
import { AccountingRepository } from './infrastructure/accounting.repository';
import { AccountingController } from './presentation/accounting.controller';

import { BANK_RECONCILIATION } from './application/bank.port';
import { BankService } from './application/bank.service';
import { BankRepository } from './infrastructure/bank.repository';
import { BankController } from './presentation/bank.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [AccountingController, BankController],
  providers: [AccountingService, { provide: ACCOUNTING, useClass: AccountingRepository }, BankService, { provide: BANK_RECONCILIATION, useClass: BankRepository }],
})
export class AccountingModule {}
