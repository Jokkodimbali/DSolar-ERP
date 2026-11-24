import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../infrastructure/http/page-query.dto';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { CommercialSearchService } from '../application/commercial-search.service';

class CommercialSearchCommercialQueryDto extends PageQueryDto {
  @IsOptional() @IsString() @MaxLength(40) @SwaggerField({ required: false, type: String, maxLength: 40 }) status?: string;
  @IsOptional() @IsUUID() @SwaggerField({ required: false, type: String, format: 'uuid' }) customerId?: string;
  @IsOptional() @IsUUID() @SwaggerField({ required: false, type: String, format: 'uuid' }) storeId?: string;
  @IsOptional() @IsUUID() @SwaggerField({ required: false, type: String, format: 'uuid' }) orderId?: string;
  @IsOptional() @IsUUID() @SwaggerField({ required: false, type: String, format: 'uuid' }) invoiceId?: string;
}
@ApiTags('Recherche commerciale')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@RequirePermissions('sales.read')
@Controller()
export class CommercialSearchController {
  constructor(private readonly service: CommercialSearchService) {}
  @Get('customers/search')
  customers(@CurrentUserId() actor: string, @Query() query: CommercialSearchCommercialQueryDto) {
    return this.service.search('customers', actor, query);
  }
  @Get('proformas/search')
  proformas(@CurrentUserId() actor: string, @Query() query: CommercialSearchCommercialQueryDto) {
    return this.service.search('proformas', actor, query);
  }
  @Get('sales-orders/search')
  orders(@CurrentUserId() actor: string, @Query() query: CommercialSearchCommercialQueryDto) {
    return this.service.search('orders', actor, query);
  }
  @Get('invoices/search')
  invoices(@CurrentUserId() actor: string, @Query() query: CommercialSearchCommercialQueryDto) {
    return this.service.search('invoices', actor, query);
  }
  @Get('deliveries/search')
  deliveries(@CurrentUserId() actor: string, @Query() query: CommercialSearchCommercialQueryDto) {
    return this.service.search('deliveries', actor, query);
  }
  @Get('payments/search')
  payments(@CurrentUserId() actor: string, @Query() query: CommercialSearchCommercialQueryDto) {
    return this.service.search('payments', actor, query);
  }
  @Get('credit-notes/search')
  creditNotes(@CurrentUserId() actor: string, @Query() query: CommercialSearchCommercialQueryDto) {
    return this.service.search('credit-notes', actor, query);
  }
}
