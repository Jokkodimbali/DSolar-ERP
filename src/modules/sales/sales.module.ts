import { Module } from '@nestjs/common';
import { PAYMENTS_REPOSITORY } from './application/payments.port';
import { PaymentsService } from './application/payments.service';
import { PrismaPaymentsRepository } from './infrastructure/prisma-payments.repository';
import { PaymentsController } from './presentation/payments.controller';
import { INVOICES_REPOSITORY } from './application/invoices.port';
import { InvoicesService } from './application/invoices.service';
import { PrismaInvoicesRepository } from './infrastructure/prisma-invoices.repository';
import { InvoicesController } from './presentation/invoices.controller';
import { DELIVERIES_REPOSITORY } from './application/deliveries.port';
import { DeliveriesService } from './application/deliveries.service';
import { PrismaDeliveriesRepository } from './infrastructure/prisma-deliveries.repository';
import { DeliveriesController } from './presentation/deliveries.controller';
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
  controllers: [
    CustomersController,
    ProformasController,
    OrdersController,
    DeliveriesController,
    InvoicesController,
    PaymentsController,
  ],
  providers: [
    CustomersService,
    OrdersService,
    DeliveriesService,
    InvoicesService,
    PaymentsService,
    { provide: PAYMENTS_REPOSITORY, useClass: PrismaPaymentsRepository },
    { provide: INVOICES_REPOSITORY, useClass: PrismaInvoicesRepository },
    { provide: DELIVERIES_REPOSITORY, useClass: PrismaDeliveriesRepository },
    { provide: ORDERS_REPOSITORY, useClass: PrismaOrdersRepository },
    ProformasService,
    { provide: PROFORMAS_REPOSITORY, useClass: PrismaProformasRepository },
    { provide: CUSTOMERS_REPOSITORY, useClass: PrismaCustomersRepository },
  ],
})
export class SalesModule {}
