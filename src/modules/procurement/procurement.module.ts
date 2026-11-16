import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { SUPPLIERS_REPOSITORY } from './application/suppliers.repository';
import { SuppliersService } from './application/suppliers.service';
import { PrismaSuppliersRepository } from './infrastructure/prisma-suppliers.repository';
import { SuppliersController } from './presentation/suppliers.controller';
import { PurchaseOrdersController } from './presentation/purchase-orders.controller';
import { PurchaseOrdersService } from './application/purchase-orders.service';
import { PurchaseOrdersRepository } from './application/purchase-orders.repository';
import { GoodsReceiptsController } from './presentation/goods-receipts.controller';
import { GoodsReceiptsService } from './application/goods-receipts.service';
import { GOODS_RECEIPTS_REPOSITORY } from './application/goods-receipts.port';
import { PrismaGoodsReceiptsRepository } from './infrastructure/prisma-goods-receipts.repository';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [SuppliersController, PurchaseOrdersController, GoodsReceiptsController],
  providers: [
    SuppliersService,
    PurchaseOrdersService,
    PurchaseOrdersRepository,
    GoodsReceiptsService,
    { provide: GOODS_RECEIPTS_REPOSITORY, useClass: PrismaGoodsReceiptsRepository },
    { provide: SUPPLIERS_REPOSITORY, useClass: PrismaSuppliersRepository },
  ],
})
export class ProcurementModule {}
