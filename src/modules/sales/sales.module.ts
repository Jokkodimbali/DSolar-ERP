import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { CUSTOMERS_REPOSITORY } from './application/customers.port';
import { CustomersService } from './application/customers.service';
import { PrismaCustomersRepository } from './infrastructure/prisma-customers.repository';
import { CustomersController } from './presentation/customers.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [CustomersController],
  providers: [CustomersService, { provide: CUSTOMERS_REPOSITORY, useClass: PrismaCustomersRepository }],
})
export class SalesModule {}
