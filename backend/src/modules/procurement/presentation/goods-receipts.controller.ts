import { ApiProperty as SwaggerField } from '@nestjs/swagger';
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

class GoodsReceiptsReceiptLineDto {
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) productId!: string;
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @SwaggerField({ type: Number, minimum: 0.001 })
  quantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @SwaggerField({ type: Number, minimum: 0 }) unitCost!: number;
}
class GoodsReceiptsCreateGoodsReceiptDto {
  @IsString() @IsNotEmpty() @MaxLength(100) @SwaggerField({ type: String, maxLength: 100 }) number!: string;
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) purchaseOrderId!: string;
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) storeId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptsReceiptLineDto)
  @SwaggerField({ type: () => [GoodsReceiptsReceiptLineDto], minItems: 1, maxItems: 100 })
  lines!: GoodsReceiptsReceiptLineDto[];
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
  @SuccessMessage('Bon de réception créé.')
  create(@Body() dto: GoodsReceiptsCreateGoodsReceiptDto, @CurrentUserId() actorId: string) {
    return this.receipts.create(dto, actorId);
  }
  @Post(':id/cancel')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Bon de réception annulé.')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.receipts.cancel(id, actorId);
  }
  @Post(':id/confirm')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Réception confirmée et stock mis à jour.')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.receipts.confirm(id, actorId);
  }
}
