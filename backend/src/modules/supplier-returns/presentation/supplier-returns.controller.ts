import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsIn,
  ArrayUnique,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { SupplierReturnsService } from '../application/supplier-returns.service';
import { PageQueryDto } from '../../../infrastructure/http/page-query.dto';
import type { SupplierReturnCriteria } from '../application/supplier-returns.port';

class SupplierReturnQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  @SwaggerField({ required: false, type: String, format: 'uuid' })
  storeId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'CONFIRMED', 'CANCELLED'])
  @SwaggerField({ required: false, enum: ['DRAFT', 'CONFIRMED', 'CANCELLED'] })
  status?: SupplierReturnCriteria['status'];
}

class SupplierReturnsReturnLineDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  receiptLineId!: string;
  @IsString()
  @MaxLength(19)
  @SwaggerField({ type: String, maxLength: 19 })
  quantity!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  @SwaggerField({ required: false, type: [String], maxItems: 100, uniqueItems: true })
  serialIds?: string[];
}

class SupplierReturnsReturnDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  receiptId!: string;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  operationKey!: string;
  @IsString()
  @MaxLength(500)
  @SwaggerField({ type: String, maxLength: 500 })
  reason!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SupplierReturnsReturnLineDto)
  @SwaggerField({ type: () => [SupplierReturnsReturnLineDto], minItems: 1, maxItems: 100 })
  lines!: SupplierReturnsReturnLineDto[];
}

class SupplierReturnsRegisterSerialsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  @SwaggerField({ type: [String], minItems: 1, maxItems: 100, uniqueItems: true })
  serials!: string[];
}

class SupplierReturnsReasonDto {
  @IsString()
  @MaxLength(500)
  @SwaggerField({ type: String, maxLength: 500 })
  reason!: string;
}

class SupplierReturnsCreditDto {
  @IsString()
  @MaxLength(100)
  @SwaggerField({ type: String, maxLength: 100 })
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
  list(
    @CurrentUserId() actor: string,
    @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string,
  ) {
    return this.service.list(actor, storeId);
  }

  @Get('search')
  @RequirePermissions('inventory.read')
  search(@CurrentUserId() actor: string, @Query() query: SupplierReturnQueryDto) {
    return this.service.search(actor, query);
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.get(id, actor);
  }

  @Post()
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Retour fournisseur enregistré.')
  create(@Body() dto: SupplierReturnsReturnDto, @CurrentUserId() actor: string) {
    return this.service.create(dto, actor);
  }

  @Post('receipt-lines/:id/serials')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Numéros de série enregistrés.')
  registerSerials(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierReturnsRegisterSerialsDto,
    @CurrentUserId() actor: string,
  ) {
    return this.service.registerSerials(id, dto.serials, actor);
  }

  @Post(':id/confirm')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Retour fournisseur confirmé.')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.confirm(id, actor);
  }

  @Post(':id/cancel')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Retour fournisseur annulé.')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierReturnsReasonDto,
    @CurrentUserId() actor: string,
  ) {
    return this.service.cancel(id, dto.reason, actor);
  }

  @Post(':id/credit')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Avoir fournisseur enregistré.')
  credit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierReturnsCreditDto,
    @CurrentUserId() actor: string,
  ) {
    return this.service.credit(id, dto.reference, actor);
  }
}
