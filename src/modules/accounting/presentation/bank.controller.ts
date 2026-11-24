import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { BankService } from '../application/bank.service';

class BankAccountDto {
  @IsUUID()
  accountId!: string;
  @IsString()
  @MaxLength(160)
  name!: string;
}
class BankLineDto {
  @IsString()
  @MaxLength(100)
  reference!: string;
  @IsString()
  @MaxLength(10)
  date!: string;
  @IsString()
  @MaxLength(500)
  description!: string;
  @IsString()
  @MaxLength(20)
  amount!: string;
}
class StatementDto {
  @IsUUID()
  bankAccountId!: string;
  @IsString()
  @MaxLength(100)
  reference!: string;
  @IsString()
  @MaxLength(10)
  start!: string;
  @IsString()
  @MaxLength(10)
  end!: string;
  @IsString()
  @MaxLength(20)
  opening!: string;
  @IsString()
  @MaxLength(20)
  closing!: string;
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BankLineDto)
  lines!: BankLineDto[];
}
class MatchDto {
  @IsUUID()
  ledgerLineId!: string;
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
  account(@Body() dto: BankAccountDto, @CurrentUserId() actor: string) {
    return this.service.createAccount(dto.accountId, dto.name, actor);
  }
  @Post('statements')
  importStatement(@Body() dto: StatementDto, @CurrentUserId() actor: string) {
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
  @Post('lines/:id/match')
  match(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MatchDto, @CurrentUserId() actor: string) {
    return this.service.match(id, dto.ledgerLineId, actor);
  }
  @Post('lines/:id/unmatch')
  unmatch(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.unmatch(id, actor);
  }
  @Post('statements/:id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.close(id, actor);
  }
}
