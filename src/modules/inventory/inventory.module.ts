import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { TransfersService } from './application/transfers.service';
import { TRANSFER_REPOSITORY } from './application/transfers.port';
import { PrismaTransfersRepository } from './infrastructure/prisma-transfers.repository';
import { TransfersController } from './presentation/transfers.controller';
import { InventoryService } from './application/inventory.service';
import { INVENTORY_REPOSITORY } from './application/inventory.port';
import { PrismaInventoryRepository } from './infrastructure/prisma-inventory.repository';
import { InventoryController } from './presentation/inventory.controller';
@Module({
  imports:[PrismaModule,IdentityModule],
  controllers:[InventoryController,TransfersController],
  providers:[InventoryService,TransfersService,{provide:TRANSFER_REPOSITORY,useClass:PrismaTransfersRepository},{provide:INVENTORY_REPOSITORY,useClass:PrismaInventoryRepository}]
})
export class InventoryModule {}
