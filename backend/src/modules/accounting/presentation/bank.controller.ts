import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { BankService } from '../application/bank.service';

class BankBankAccountDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' }) accountId!: string;
  @IsString()
  @MaxLength(160)
  @SwaggerField({ type: String, maxLength: 160 }) name!: string;
}
class BankBankLineDto {
  @IsString()
  @MaxLength(100)
  @SwaggerField({ type: String, maxLength: 100 }) reference!: string;
  @IsString()
  @MaxLength(10)
  @SwaggerField({ type: String, maxLength: 10 }) date!: string;
  @IsString()
  @MaxLength(500)
  @SwaggerField({ type: String, maxLength: 500 }) description!: string;
  @IsString()
  @MaxLength(20)
  @SwaggerField({ type: String, maxLength: 20 }) amount!: string;
}
class BankStatementDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' }) bankAccountId!: string;
  @IsString()
  @MaxLength(100)
  @SwaggerField({ type: String, maxLength: 100 }) reference!: string;
  @IsString()
  @MaxLength(10)
  @SwaggerField({ type: String, maxLength: 10 }) start!: string;
  @IsString()
  @MaxLength(10)
  @SwaggerField({ type: String, maxLength: 10 }) end!: string;
  @IsString()
  @MaxLength(20)
  @SwaggerField({ type: String, maxLength: 20 }) opening!: string;
  @IsString()
  @MaxLength(20)
  @SwaggerField({ type: String, maxLength: 20 }) closing!: string;
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BankBankLineDto)
  @SwaggerField({ type: () => [BankBankLineDto], maxItems: 500 }) lines!: BankBankLineDto[];
}
class BankMatchDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' }) ledgerLineId!: string;
}

@ApiTags('Rapprochement bancaire')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@RequirePermissions('users.manage')
@Controller('accounting/bank')
export class BankController {
  constructor(private readonly service: BankService) {}

  @Get('accounts')
  accounts(@CurrentUserId() actor: string) {
    return this.service.accounts(actor);
  }
  @Post('accounts')
  @SuccessMessage('Compte bancaire enregistré.')
  account(@Body() dto: BankBankAccountDto, @CurrentUserId() actor: string) {
    return this.service.createAccount(dto.accountId, dto.name, actor);
  }
  @Post('statements')
  @SuccessMessage('Relevé bancaire importé.')
  importStatement(@Body() dto: BankStatementDto, @CurrentUserId() actor: string) {
    return this.service.importStatement(dto, actor);
  }
  @Get('accounts/:id/statements')
  statements(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.statements(id, actor);
  }
  @Get('statements/:id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.detail(id, actor);
  }
  @Get('statements/:id/suggestions')
  suggestions(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.suggestions(id, actor);
  }
  @Post('lines/:id/match')
  @SuccessMessage('Ligne bancaire rapprochée.')
  match(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BankMatchDto, @CurrentUserId() actor: string) {
    return this.service.match(id, dto.ledgerLineId, actor);
  }
  @Post('lines/:id/unmatch')
  @SuccessMessage('Rapprochement bancaire annulé.')
  unmatch(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.unmatch(id, actor);
  }
  @Post('statements/:id/close')
  @SuccessMessage('Rapprochement du relevé clôturé.')
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.close(id, actor);
  }
}
