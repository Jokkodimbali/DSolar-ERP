import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { TREASURY } from './application/treasury.port';
import { TreasuryService } from './application/treasury.service';
import { TreasuryRepository } from './infrastructure/treasury.repository';
import { TreasuryController } from './presentation/treasury.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [TreasuryController],
  providers: [TreasuryService, { provide: TREASURY, useClass: TreasuryRepository }],
})
export class TreasuryModule {}
