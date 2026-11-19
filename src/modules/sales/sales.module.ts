import { Module } from '@nestjs/common';
import { ORDERS_REPOSITORY } from './application/orders.port';
import { OrdersService } from './application/orders.service';
import { PrismaOrdersRepository } from './infrastructure/prisma-orders.repository';
import { OrdersController } from './presentation/orders.controller';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { CUSTOMERS_REPOSITORY } from './application/customers.port';
import { CustomersService } from './application/customers.service';
import { PrismaCustomersRepository } from './infrastructure/prisma-customers.repository';
import { CustomersController } from './presentation/customers.controller';
import { ProformasController } from './presentation/proformas.controller';
import { ProformasService } from './application/proformas.service';
import { PROFORMAS_REPOSITORY } from './application/proformas.port';
import { PrismaProformasRepository } from './infrastructure/prisma-proformas.repository';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [CustomersController, ProformasController, OrdersController],
  providers: [
    CustomersService,
    OrdersService,
    { provide: ORDERS_REPOSITORY, useClass: PrismaOrdersRepository },
    ProformasService,
    { provide: PROFORMAS_REPOSITORY, useClass: PrismaProformasRepository },
    { provide: CUSTOMERS_REPOSITORY, useClass: PrismaCustomersRepository },
  ],
})
export class SalesModule {}
