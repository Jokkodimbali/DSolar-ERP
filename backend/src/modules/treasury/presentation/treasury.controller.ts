import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { TreasuryService } from '../application/treasury.service';

class TreasuryRegisterDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' }) storeId!: string;
  @IsString()
  @MaxLength(100)
  @SwaggerField({ type: String, maxLength: 100 }) name!: string;
}
class TreasuryAmountDto {
  @IsString()
  @MaxLength(20)
  @SwaggerField({ type: String, maxLength: 20 }) amount!: string;
}
class TreasuryMovementDto extends TreasuryAmountDto {
  @IsString()
  @MaxLength(200)
  @SwaggerField({ type: String, maxLength: 200 }) reason!: string;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' }) operationKey!: string;
}

class TreasuryOperationDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' }) operationKey!: string;
}

class TreasuryTransferDto extends TreasuryAmountDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' }) destinationId!: string;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' }) operationKey!: string;
}

class TreasuryReverseDto extends TreasuryOperationDto {
  @IsString()
  @MaxLength(200)
  @SwaggerField({ type: String, maxLength: 200 }) reason!: string;
}

class TreasuryReconcileDto extends TreasuryOperationDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' }) paymentId!: string;
}

@ApiTags('Trésorerie')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('treasury')
export class TreasuryController {
  constructor(private readonly service: TreasuryService) {}

  @Get('registers')
  @RequirePermissions('sales.read')
  list(@CurrentUserId() actor: string) {
    return this.service.list(actor);
  }

  @Post('registers')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Caisse créée.')
  create(@Body() dto: TreasuryRegisterDto, @CurrentUserId() actor: string) {
    return this.service.create(dto.storeId, dto.name, actor);
  }

  @Post('registers/:id/open')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Session de caisse ouverte.')
  open(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TreasuryAmountDto, @CurrentUserId() actor: string) {
    return this.service.open(id, dto.amount, actor);
  }

  @Post('sessions/:id/movements')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Mouvement de caisse enregistré.')
  move(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TreasuryMovementDto, @CurrentUserId() actor: string) {
    return this.service.move(id, dto.amount, dto.reason, dto.operationKey, actor);
  }

  @Get('sessions/:id/summary')
  @RequirePermissions('sales.read')
  summary(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.summary(id, actor);
  }

  @Post('sessions/:id/transfer')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Transfert de trésorerie enregistré.')
  transfer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TreasuryTransferDto, @CurrentUserId() actor: string) {
    return this.service.transfer(id, dto.destinationId, dto.amount, dto.operationKey, actor);
  }

  @Post('movements/:id/reverse')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Mouvement de caisse contrepassé.')
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TreasuryReverseDto, @CurrentUserId() actor: string) {
    return this.service.reverse(id, dto.reason, dto.operationKey, actor);
  }

  @Post('sessions/:id/reconcile')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Encaissement rapproché avec la caisse.')
  reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TreasuryReconcileDto,
    @CurrentUserId() actor: string,
  ) {
    return this.service.reconcile(id, dto.paymentId, dto.operationKey, actor);
  }

  @Post('sessions/:id/close')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Session de caisse clôturée.')
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TreasuryAmountDto, @CurrentUserId() actor: string) {
    return this.service.close(id, dto.amount, actor);
  }
}
