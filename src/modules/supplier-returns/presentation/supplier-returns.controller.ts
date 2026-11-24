import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { SupplierReturnsService } from '../application/supplier-returns.service';

class ReturnLineDto {
  @IsUUID()
  receiptLineId!: string;
  @IsString()
  @MaxLength(19)
  quantity!: string;
}

class ReturnDto {
  @IsUUID()
  receiptId!: string;
  @IsUUID()
  operationKey!: string;
  @IsString()
  @MaxLength(500)
  reason!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines!: ReturnLineDto[];
}

class ReasonDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

class CreditDto {
  @IsString()
  @MaxLength(100)
  reference!: string;
}

@ApiTags('Retours fournisseurs')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('supplier-returns')
export class SupplierReturnsController {
  constructor(private readonly service: SupplierReturnsService) {}

  @Get()
  @RequirePermissions('inventory.read')
  list(@CurrentUserId() actor: string, @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string) {
    return this.service.list(actor, storeId);
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.get(id, actor);
  }

  @Post()
  @RequirePermissions('inventory.manage')
  create(@Body() dto: ReturnDto, @CurrentUserId() actor: string) {
    return this.service.create(dto, actor);
  }

  @Post(':id/confirm')
  @RequirePermissions('inventory.manage')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.confirm(id, actor);
  }

  @Post(':id/cancel')
  @RequirePermissions('inventory.manage')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUserId() actor: string) {
    return this.service.cancel(id, dto.reason, actor);
  }

  @Post(':id/credit')
  @RequirePermissions('sales.manage')
  credit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreditDto, @CurrentUserId() actor: string) {
    return this.service.credit(id, dto.reference, actor);
  }
}
