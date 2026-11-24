import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
import { Type } from 'class-transformer';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { PurchaseOrdersService } from '../application/purchase-orders.service';

class PurchaseOrdersPurchaseOrderLineDto {
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) productId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @SwaggerField({ type: Number, minimum: 0.001 }) quantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @SwaggerField({ type: Number, minimum: 0 }) unitCost!: number;
}
class PurchaseOrdersCreatePurchaseOrderDto {
  @IsString() @IsNotEmpty() @MaxLength(100) @SwaggerField({ type: String, maxLength: 100 }) number!: string;
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) supplierId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrdersPurchaseOrderLineDto)
  @SwaggerField({ type: () => [PurchaseOrdersPurchaseOrderLineDto], minItems: 1, maxItems: 100 }) lines!: PurchaseOrdersPurchaseOrderLineDto[];
}
@ApiTags('Commandes fournisseurs')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}
  @Get() @RequirePermissions('inventory.read') list() {
    return this.orders.list();
  }
  @Get('outstanding') @RequirePermissions('inventory.read') outstanding() {
    return this.orders.outstanding();
  }
  @Get(':id') @RequirePermissions('inventory.read') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }
  @Get(':id/progress') @RequirePermissions('inventory.read') progress(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.progress(id);
  }
  @Post() @RequirePermissions('inventory.manage') @SuccessMessage('Commande fournisseur créée.') create(
    @Body() dto: PurchaseOrdersCreatePurchaseOrderDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.orders.create(dto, actorId);
  }
  @Post(':id/cancel')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Commande fournisseur annulée.')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.orders.cancel(id, actorId);
  }
  @Post(':id/confirm')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Commande fournisseur confirmée.')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.orders.confirm(id, actorId);
  }
}
