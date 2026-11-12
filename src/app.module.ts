import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { IdentityModule } from './modules/identity/identity.module';
import { StoresModule } from './modules/stores/stores.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProductsModule } from './modules/products/products.module';
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, IdentityModule, StoresModule, ProductsModule, InventoryModule],
  controllers: [HealthController],
})
export class AppModule {}
