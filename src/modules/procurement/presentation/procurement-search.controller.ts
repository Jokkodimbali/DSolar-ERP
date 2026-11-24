import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../infrastructure/http/page-query.dto';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { ProcurementSearchService } from '../application/procurement-search.service';

class ProcurementQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['true', 'false']) active?: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() storeId?: string;
}
function criteria(query: ProcurementQueryDto) {
  const { active, ...rest } = query;
  return { ...rest, active: active === undefined ? undefined : active === 'true' };
}

@ApiTags('Recherche approvisionnement')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
export class ProcurementSearchController {
  constructor(private readonly service: ProcurementSearchService) {}
  @Get('suppliers/search')
  @RequirePermissions('inventory.read')
  suppliers(@CurrentUserId() actor: string, @Query() query: ProcurementQueryDto) {
    return this.service.search('suppliers', actor, criteria(query));
  }
  @Get('purchase-orders/search')
  @RequirePermissions('inventory.read')
  orders(@CurrentUserId() actor: string, @Query() query: ProcurementQueryDto) {
    return this.service.search('purchase-orders', actor, criteria(query));
  }
  @Get('goods-receipts/search')
  @RequirePermissions('inventory.read')
  receipts(@CurrentUserId() actor: string, @Query() query: ProcurementQueryDto) {
    return this.service.search('receipts', actor, criteria(query));
  }
}
