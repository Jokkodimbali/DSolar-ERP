import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../infrastructure/http/page-query.dto';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { CommercialSearchService } from '../application/commercial-search.service';

class CommercialQueryDto extends PageQueryDto {
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() storeId?: string;
}
@ApiTags('Recherche commerciale')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@RequirePermissions('sales.read')
@Controller()
export class CommercialSearchController {
  constructor(private readonly service: CommercialSearchService) {}
  @Get('customers/search')
  customers(@CurrentUserId() actor: string, @Query() query: CommercialQueryDto) {
    return this.service.search('customers', actor, query);
  }
  @Get('proformas/search')
  proformas(@CurrentUserId() actor: string, @Query() query: CommercialQueryDto) {
    return this.service.search('proformas', actor, query);
  }
  @Get('sales-orders/search')
  orders(@CurrentUserId() actor: string, @Query() query: CommercialQueryDto) {
    return this.service.search('orders', actor, query);
  }
  @Get('invoices/search')
  invoices(@CurrentUserId() actor: string, @Query() query: CommercialQueryDto) {
    return this.service.search('invoices', actor, query);
  }
}
