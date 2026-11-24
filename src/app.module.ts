import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { IdentityModule } from './modules/identity/identity.module';
import { StoresModule } from './modules/stores/stores.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProductsModule } from './modules/products/products.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { SalesModule } from './modules/sales/sales.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { SupplierReturnsModule } from './modules/supplier-returns/supplier-returns.module';
import { AccountingModule } from './modules/accounting/accounting.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    IdentityModule,
    StoresModule,
    ProductsModule,
    InventoryModule,
    ProcurementModule,
    SalesModule,
    DashboardModule,
    AuditModule,
    TreasuryModule,
    ExpensesModule,
    SupplierReturnsModule,
    AccountingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
