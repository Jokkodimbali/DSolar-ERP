import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { ACCOUNT_CLASSES, AccountClass } from '../domain/financial-statements';
import { SOURCE_TYPES, SourceType } from '../domain/source-types';
import { AccountingService } from '../application/accounting.service';

class AccountingCodeDto {
  @IsString()
  @MaxLength(30)
  @SwaggerField({ type: String, maxLength: 30 })
  code!: string;
  @IsString()
  @MaxLength(160)
  @SwaggerField({ type: String, maxLength: 160 })
  name!: string;
}
class AccountingClassificationDto {
  @IsIn([...ACCOUNT_CLASSES])
  @SwaggerField({ enum: [...ACCOUNT_CLASSES] })
  category!: AccountClass;
}
class AccountingAutomationDto {
  @IsBoolean()
  @SwaggerField({ type: Boolean })
  enabled!: boolean;
}
class AccountingPeriodDto {
  @IsString()
  @MaxLength(100)
  @SwaggerField({ type: String, maxLength: 100 })
  name!: string;
  @IsString()
  @MaxLength(10)
  @SwaggerField({ type: String, maxLength: 10 })
  start!: string;
  @IsString()
  @MaxLength(10)
  @SwaggerField({ type: String, maxLength: 10 })
  end!: string;
}
class AccountingLineDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  accountId!: string;
  @IsString()
  @MaxLength(19)
  @SwaggerField({ type: String, maxLength: 19 })
  debit!: string;
  @IsString()
  @MaxLength(19)
  @SwaggerField({ type: String, maxLength: 19 })
  credit!: string;
}
class AccountingPostingDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  journalId!: string;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  periodId!: string;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  operationKey!: string;
  @IsString()
  @MaxLength(10)
  @SwaggerField({ type: String, maxLength: 10 })
  date!: string;
  @IsString()
  @MaxLength(500)
  @SwaggerField({ type: String, maxLength: 500 })
  description!: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AccountingLineDto)
  @SwaggerField({ type: () => [AccountingLineDto], minItems: 2, maxItems: 100 })
  lines!: AccountingLineDto[];
}
class AccountingRuleDto {
  @IsString()
  @MaxLength(120)
  @SwaggerField({ type: String, maxLength: 120 })
  key!: string;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  journalId!: string;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  debitAccountId!: string;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  creditAccountId!: string;
  @IsOptional()
  @IsUUID()
  @SwaggerField({ required: false, type: String, format: 'uuid' })
  taxAccountId?: string;
}

class AccountingSourceDto {
  @IsIn([...SOURCE_TYPES])
  @SwaggerField({ enum: [...SOURCE_TYPES] })
  type!: SourceType;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  id!: string;
}

class AccountingReverseDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  periodId!: string;
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  operationKey!: string;
  @IsString()
  @MaxLength(10)
  @SwaggerField({ type: String, maxLength: 10 })
  date!: string;
  @IsString()
  @MaxLength(500)
  @SwaggerField({ type: String, maxLength: 500 })
  reason!: string;
}

@ApiTags('Comptabilité')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@RequirePermissions('users.manage')
@Controller('accounting')
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  @Get('setup')
  setup(@CurrentUserId() actor: string) {
    return this.service.setup(actor);
  }
  @Post('rules')
  @SuccessMessage('Règle de comptabilisation enregistrée.')
  rule(@Body() dto: AccountingRuleDto, @CurrentUserId() actor: string) {
    return this.service.rule(dto, actor);
  }
  @Post('sources')
  @SuccessMessage('Comptabilisation de la source effectuée.')
  source(@Body() dto: AccountingSourceDto, @CurrentUserId() actor: string) {
    return this.service.postSource(dto.type, dto.id, actor);
  }
  @Post('accounts')
  @SuccessMessage('Compte comptable créé.')
  account(@Body() dto: AccountingCodeDto, @CurrentUserId() actor: string) {
    return this.service.account(dto.code, dto.name, actor);
  }
  @Post('accounts/:id/classify')
  @SuccessMessage('Classification du compte enregistrée.')
  classify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountingClassificationDto,
    @CurrentUserId() actor: string,
  ) {
    return this.service.classify(id, dto.category, actor);
  }
  @Get('periods/:id/statements')
  statements(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.statements(id, actor);
  }
  @Post('journals')
  @SuccessMessage('Journal comptable créé.')
  journal(@Body() dto: AccountingCodeDto, @CurrentUserId() actor: string) {
    return this.service.journal(dto.code, dto.name, actor);
  }
  @Post('periods')
  @SuccessMessage('Période comptable créée.')
  period(@Body() dto: AccountingPeriodDto, @CurrentUserId() actor: string) {
    return this.service.period(dto.name, dto.start, dto.end, actor);
  }
  @Get('periods/:id/automation')
  automation(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.automation(id, actor);
  }
  @Post('periods/:id/automation')
  @SuccessMessage('Paramètres de comptabilisation automatique enregistrés.')
  configureAutomation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountingAutomationDto,
    @CurrentUserId() actor: string,
  ) {
    return this.service.configureAutomation(id, dto.enabled, actor);
  }
  @Get('periods/:id/pending')
  pending(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.pending(id, actor);
  }
  @Post('periods/:id/post-pending')
  @SuccessMessage('Traitement des écritures en attente terminé. Consultez le bilan du traitement.')
  postPending(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.postPending(id, actor);
  }
  @Post('periods/:id/close')
  @SuccessMessage('Période comptable clôturée.')
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.close(id, actor);
  }
  @Post('entries')
  @SuccessMessage('Écriture comptable enregistrée.')
  post(@Body() dto: AccountingPostingDto, @CurrentUserId() actor: string) {
    return this.service.post(dto, actor);
  }
  @Post('entries/:id/reverse')
  @SuccessMessage('Écriture comptable contrepassée.')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountingReverseDto,
    @CurrentUserId() actor: string,
  ) {
    return this.service.reverse(id, dto.periodId, dto.date, dto.reason, dto.operationKey, actor);
  }
  @Get('periods/:id/entries')
  entries(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() actor: string,
    @Query('accountId', new ParseUUIDPipe({ optional: true })) accountId?: string,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
  ) {
    return this.service.entries(id, actor, accountId, cursor);
  }
  @Get('periods/:id/trial-balance')
  balance(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.trialBalance(id, actor);
  }
}
