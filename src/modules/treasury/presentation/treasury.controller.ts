import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { TreasuryService } from '../application/treasury.service';

class RegisterDto {
  @IsUUID()
  storeId!: string;
  @IsString()
  @MaxLength(100)
  name!: string;
}
class AmountDto {
  @IsString()
  @MaxLength(20)
  amount!: string;
}
class MovementDto extends AmountDto {
  @IsString()
  @MaxLength(200)
  reason!: string;
  @IsUUID()
  operationKey!: string;
}

class OperationDto {
  @IsUUID()
  operationKey!: string;
}

class TransferDto extends AmountDto {
  @IsUUID()
  destinationId!: string;
  @IsUUID()
  operationKey!: string;
}

class ReverseDto extends OperationDto {
  @IsString()
  @MaxLength(200)
  reason!: string;
}

class ReconcileDto extends OperationDto {
  @IsUUID()
  paymentId!: string;
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
  create(@Body() dto: RegisterDto, @CurrentUserId() actor: string) {
    return this.service.create(dto.storeId, dto.name, actor);
  }

  @Post('registers/:id/open')
  @RequirePermissions('sales.manage')
  open(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AmountDto, @CurrentUserId() actor: string) {
    return this.service.open(id, dto.amount, actor);
  }

  @Post('sessions/:id/movements')
  @RequirePermissions('sales.manage')
  move(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MovementDto, @CurrentUserId() actor: string) {
    return this.service.move(id, dto.amount, dto.reason, dto.operationKey, actor);
  }

  @Get('sessions/:id/summary')
  @RequirePermissions('sales.read')
  summary(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.summary(id, actor);
  }

  @Post('sessions/:id/transfer')
  @RequirePermissions('sales.manage')
  transfer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferDto, @CurrentUserId() actor: string) {
    return this.service.transfer(id, dto.destinationId, dto.amount, dto.operationKey, actor);
  }

  @Post('movements/:id/reverse')
  @RequirePermissions('sales.manage')
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseDto, @CurrentUserId() actor: string) {
    return this.service.reverse(id, dto.reason, dto.operationKey, actor);
  }

  @Post('sessions/:id/reconcile')
  @RequirePermissions('sales.manage')
  reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconcileDto,
    @CurrentUserId() actor: string,
  ) {
    return this.service.reconcile(id, dto.paymentId, dto.operationKey, actor);
  }

  @Post('sessions/:id/close')
  @RequirePermissions('sales.manage')
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AmountDto, @CurrentUserId() actor: string) {
    return this.service.close(id, dto.amount, actor);
  }
}
