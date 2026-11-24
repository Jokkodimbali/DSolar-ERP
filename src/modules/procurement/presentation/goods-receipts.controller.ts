import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { GoodsReceiptsService } from '../application/goods-receipts.service';

class ReceiptLineDto {
  @IsUUID() productId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitCost!: number;
}
class CreateGoodsReceiptDto {
  @IsString() @IsNotEmpty() @MaxLength(100) number!: string;
  @IsUUID() purchaseOrderId!: string;
  @IsUUID() storeId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];
}
@ApiTags('Réceptions fournisseurs')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly receipts: GoodsReceiptsService) {}
  @Get()
  @RequirePermissions('inventory.read')
  list(@CurrentUserId() actorId: string) {
    return this.receipts.list(actorId);
  }
  @Get(':id')
  @RequirePermissions('inventory.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.receipts.get(id, actorId);
  }
  @Post()
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Bon de réception créé.') create(@Body() dto: CreateGoodsReceiptDto, @CurrentUserId() actorId: string) {
    return this.receipts.create(dto, actorId);
  }
  @Post(':id/cancel')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Bon de réception annulé.') cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.receipts.cancel(id, actorId);
  }
  @Post(':id/confirm')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Réception confirmée et stock mis à jour.') confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.receipts.confirm(id, actorId);
  }
}
