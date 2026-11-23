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

class PurchaseOrderLineDto {
  @IsUUID() productId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitCost!: number;
}
class CreatePurchaseOrderDto {
  @IsString() @IsNotEmpty() @MaxLength(100) number!: string;
  @IsUUID() supplierId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];
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
  @Post() @RequirePermissions('inventory.manage') create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.orders.create(dto, actorId);
  }
  @Post(':id/cancel') @RequirePermissions('inventory.manage') cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() actorId: string,
  ) {
    return this.orders.cancel(id, actorId);
  }
  @Post(':id/confirm') @RequirePermissions('inventory.manage') confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() actorId: string,
  ) {
    return this.orders.confirm(id, actorId);
  }
}
