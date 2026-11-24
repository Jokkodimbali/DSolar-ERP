import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { OPERATIONAL_SEARCH } from './application/operational-search.port';
import { OperationalSearchService } from './application/operational-search.service';
import { PrismaOperationalSearchRepository } from './infrastructure/prisma-operational-search.repository';
import { OperationalSearchController } from './presentation/operational-search.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [OperationalSearchController],
  providers: [
    OperationalSearchService,
    { provide: OPERATIONAL_SEARCH, useClass: PrismaOperationalSearchRepository },
  ],
})
export class OperationalSearchModule {}
