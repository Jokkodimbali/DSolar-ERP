import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { ProformasService } from '../application/proformas.service';

class ProformaLineDto {
  @IsUUID() productId!: string;
  @IsUUID() storeId!: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitPrice!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discount!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) taxRate!: number;
}
class CreateProformaDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) number?: string;
  @IsUUID() customerId!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProformaLineDto)
  lines!: ProformaLineDto[];
}
@ApiTags('Devis proforma')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('proformas')
export class ProformasController {
  constructor(private readonly proformas: ProformasService) {}
  @Get() @RequirePermissions('sales.read') list() {
    return this.proformas.list();
  }
  @Get(':id')
  @RequirePermissions('sales.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.proformas.get(id);
  }
  @Post()
  @RequirePermissions('sales.manage')
  create(@Body() dto: CreateProformaDto) {
    return this.proformas.create(dto);
  }
  @Post(':id/issue')
  @RequirePermissions('sales.manage')
  issue(@Param('id', ParseUUIDPipe) id: string) {
    return this.proformas.issue(id);
  }

  @Put(':id')
  @RequirePermissions('sales.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateProformaDto) {
    return this.proformas.update(id, dto);
  }
  @Post(':id/accept')
  @RequirePermissions('sales.manage')
  accept(@Param('id', ParseUUIDPipe) id: string) {
    return this.proformas.accept(id);
  }
  @Post(':id/cancel')
  @RequirePermissions('sales.manage')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.proformas.cancel(id);
  }
  @Post(':id/expire')
  @RequirePermissions('sales.manage')
  expire(@Param('id', ParseUUIDPipe) id: string) {
    return this.proformas.expire(id);
  }
}
