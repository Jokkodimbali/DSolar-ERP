import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { ExpenseMethod } from '../application/expenses.port';
import { ExpensesService } from '../application/expenses.service';

class CategoryDto {
  @IsString()
  @MaxLength(100)
  name!: string;
}

class ExpenseDto {
  @IsUUID()
  storeId!: string;
  @IsUUID()
  categoryId!: string;
  @IsString()
  @MaxLength(500)
  description!: string;
  @IsString()
  @MaxLength(19)
  amount!: string;
  @IsUUID()
  operationKey!: string;
}

class PayDto {
  @IsIn(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'OTHER'])
  method!: ExpenseMethod;
  @IsOptional()
  @IsUUID()
  sessionId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

class ReasonDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

@ApiTags('Dépenses')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get('categories')
  @RequirePermissions('sales.read')
  categories(@CurrentUserId() actor: string) {
    return this.service.categories(actor);
  }

  @Post('categories')
  @RequirePermissions('sales.manage')
  createCategory(@Body() dto: CategoryDto, @CurrentUserId() actor: string) {
    return this.service.createCategory(dto.name, actor);
  }

  @Get('summary')
  @RequirePermissions('sales.read')
  summary(
    @CurrentUserId() actor: string,
    @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string,
  ) {
    return this.service.summary(actor, storeId);
  }

  @Get()
  @RequirePermissions('sales.read')
  list(
    @CurrentUserId() actor: string,
    @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string,
  ) {
    return this.service.list(actor, storeId);
  }

  @Post()
  @RequirePermissions('sales.manage')
  create(@Body() dto: ExpenseDto, @CurrentUserId() actor: string) {
    return this.service.create(dto, actor);
  }

  @Post(':id/approve')
  @RequirePermissions('sales.manage')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.approve(id, actor);
  }

  @Post(':id/pay')
  @RequirePermissions('sales.manage')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayDto, @CurrentUserId() actor: string) {
    return this.service.pay(id, dto, actor);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales.manage')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUserId() actor: string) {
    return this.service.cancel(id, dto.reason, actor);
  }

  @Post(':id/refund')
  @RequirePermissions('sales.manage')
  refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUserId() actor: string) {
    return this.service.refund(id, dto.reason, actor);
  }
}
