import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
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
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
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
  @Get()
  @RequirePermissions('sales.read')
  list(@CurrentUserId() actorId: string) {
    return this.proformas.list(actorId);
  }
  @Get(':id')
  @RequirePermissions('sales.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.proformas.get(id, actorId);
  }
  @Post()
  @RequirePermissions('sales.manage')
  @SuccessMessage('Proforma créée avec succès.')
  create(@Body() dto: CreateProformaDto, @CurrentUserId() actorId: string) {
    return this.proformas.create(dto, actorId);
  }
  @Post(':id/issue')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Proforma émise avec succès.')
  issue(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.proformas.issue(id, actorId);
  }

  @Put(':id')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Proforma mise à jour.')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProformaDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.proformas.update(id, dto, actorId);
  }
  @Post(':id/accept')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Proforma acceptée.')
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.proformas.accept(id, actorId);
  }
  @Post(':id/cancel')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Proforma annulée.')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.proformas.cancel(id, actorId);
  }
  @Post(':id/expire')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Proforma expirée.')
  expire(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.proformas.expire(id, actorId);
  }
}
