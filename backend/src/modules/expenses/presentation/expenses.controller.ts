import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { ExpenseMethod } from '../application/expenses.port';
import { ExpensesService } from '../application/expenses.service';

class ExpensesCategoryDto {
  @IsString()
  @MaxLength(100)
  @SwaggerField({ type: String, maxLength: 100 })
  name!: string;
}

class ExpensesExpenseDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  storeId!: string;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  categoryId!: string;
  @IsString()
  @MaxLength(500)
  @SwaggerField({ type: String, maxLength: 500 })
  description!: string;
  @IsString()
  @MaxLength(19)
  @SwaggerField({ type: String, maxLength: 19 })
  amount!: string;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  operationKey!: string;
}

class ExpensesPayDto {
  @IsIn(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'OTHER'])
  @SwaggerField({ enum: ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'OTHER'] })
  method!: ExpenseMethod;
  @IsOptional()
  @IsUUID()
  @SwaggerField({ required: false, type: String, format: 'uuid' })
  sessionId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @SwaggerField({ required: false, type: String, maxLength: 200 })
  reference?: string;
}

class ExpensesReasonDto {
  @IsString()
  @MaxLength(500)
  @SwaggerField({ type: String, maxLength: 500 })
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
  @SuccessMessage('Catégorie de dépense créée.')
  createCategory(@Body() dto: ExpensesCategoryDto, @CurrentUserId() actor: string) {
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
  @SuccessMessage('Dépense enregistrée.')
  create(@Body() dto: ExpensesExpenseDto, @CurrentUserId() actor: string) {
    return this.service.create(dto, actor);
  }

  @Post(':id/approve')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Dépense approuvée.')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.approve(id, actor);
  }

  @Post(':id/pay')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Dépense réglée.')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExpensesPayDto, @CurrentUserId() actor: string) {
    return this.service.pay(id, dto, actor);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Dépense annulée.')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpensesReasonDto,
    @CurrentUserId() actor: string,
  ) {
    return this.service.cancel(id, dto.reason, actor);
  }

  @Post(':id/refund')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Remboursement de dépense enregistré.')
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpensesReasonDto,
    @CurrentUserId() actor: string,
  ) {
    return this.service.refund(id, dto.reason, actor);
  }
}
