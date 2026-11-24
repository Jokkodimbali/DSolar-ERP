import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
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
  @Get('stores/:storeId/stock')
  @RequirePermissions('inventory.read')
  listStoreStock(@Param('storeId', ParseUUIDPipe) storeId: string, @CurrentUserId() actorId: string) {
    return this.inventory.listStoreStock(storeId, actorId);
  }
  @Get('stores/:storeId/summary')
  @RequirePermissions('inventory.read')
  summary(@Param('storeId', ParseUUIDPipe) storeId: string, @CurrentUserId() actorId: string) {
    return this.inventory.stockSummary(storeId, actorId);
  }
  @Get('stores/:storeId/alerts')
  @RequirePermissions('inventory.read')
  alerts(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @CurrentUserId() actorId: string,
    @Query('threshold') threshold?: string,
  ) {
    return this.inventory.stockAlerts(storeId, actorId, threshold);
  }
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
  @SuccessMessage('Ajustement de stock enregistré.')
  adjust(@Body() dto: AdjustStockDto, @CurrentUserId() actorId: string) {
    return this.inventory.adjust({ ...dto, actorId });
  }
}
