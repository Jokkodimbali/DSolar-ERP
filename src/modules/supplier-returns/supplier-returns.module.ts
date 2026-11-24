import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { SUPPLIER_RETURNS } from './application/supplier-returns.port';
import { SupplierReturnsService } from './application/supplier-returns.service';
import { SupplierReturnsRepository } from './infrastructure/supplier-returns.repository';
import { SupplierReturnsController } from './presentation/supplier-returns.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [SupplierReturnsController],
  providers: [SupplierReturnsService, { provide: SUPPLIER_RETURNS, useClass: SupplierReturnsRepository }],
})
export class SupplierReturnsModule {}
