import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { InventoryService } from '../application/inventory.service';
import { AdjustStockDto } from './adjust-stock.dto';

@ApiTags('Stocks')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  @Get('stores/:storeId/products/:productId')
  @RequirePermissions('inventory.read')
  balance(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUserId() actorId: string,
  ) {
    return this.inventory.balance(storeId, productId, actorId);
  }
  @Post('adjustments')
  @RequirePermissions('inventory.manage')
  adjust(@Body() dto: AdjustStockDto, @CurrentUserId() actorId: string) {
    return this.inventory.adjust({ ...dto, actorId });
  }
}
