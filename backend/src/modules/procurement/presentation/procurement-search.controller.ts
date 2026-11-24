import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../infrastructure/http/page-query.dto';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { ProcurementSearchService } from '../application/procurement-search.service';

class ProcurementSearchProcurementQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['true', 'false']) @SwaggerField({ required: false, enum: ['true', 'false'] }) active?: string;
  @IsOptional() @IsIn(['true', 'false']) @SwaggerField({ required: false, enum: ['true', 'false'] }) outstanding?: string;
  @IsOptional() @IsString() @MaxLength(40) @SwaggerField({ required: false, type: String, maxLength: 40 }) status?: string;
  @IsOptional() @IsUUID() @SwaggerField({ required: false, type: String, format: 'uuid' }) supplierId?: string;
  @IsOptional() @IsUUID() @SwaggerField({ required: false, type: String, format: 'uuid' }) storeId?: string;
}
function criteria(query: ProcurementSearchProcurementQueryDto) {
  const { active, outstanding, ...rest } = query;
  return {
    ...rest,
    active: active === undefined ? undefined : active === 'true',
    outstanding: outstanding === undefined ? undefined : outstanding === 'true',
  };
}

@ApiTags('Recherche approvisionnement')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
export class ProcurementSearchController {
  constructor(private readonly service: ProcurementSearchService) {}
  @Get('suppliers/search')
  @RequirePermissions('inventory.read')
  suppliers(@CurrentUserId() actor: string, @Query() query: ProcurementSearchProcurementQueryDto) {
    return this.service.search('suppliers', actor, criteria(query));
  }
  @Get('purchase-orders/search')
  @RequirePermissions('inventory.read')
  orders(@CurrentUserId() actor: string, @Query() query: ProcurementSearchProcurementQueryDto) {
    return this.service.search('purchase-orders', actor, criteria(query));
  }
  @Get('goods-receipts/search')
  @RequirePermissions('inventory.read')
  receipts(@CurrentUserId() actor: string, @Query() query: ProcurementSearchProcurementQueryDto) {
    return this.service.search('receipts', actor, criteria(query));
  }
}
