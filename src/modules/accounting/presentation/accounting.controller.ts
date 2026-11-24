import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AccountingService } from '../application/accounting.service';

class CodeDto {
  @IsString()
  @MaxLength(30)
  code!: string;
  @IsString()
  @MaxLength(160)
  name!: string;
}
class PeriodDto {
  @IsString()
  @MaxLength(100)
  name!: string;
  @IsString()
  @MaxLength(10)
  start!: string;
  @IsString()
  @MaxLength(10)
  end!: string;
}
class LineDto {
  @IsUUID()
  accountId!: string;
  @IsString()
  @MaxLength(19)
  debit!: string;
  @IsString()
  @MaxLength(19)
  credit!: string;
}
class PostingDto {
  @IsUUID()
  journalId!: string;
  @IsUUID()
  periodId!: string;
  @IsUUID()
  operationKey!: string;
  @IsString()
  @MaxLength(10)
  date!: string;
  @IsString()
  @MaxLength(500)
  description!: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}
class ReverseDto {
  @IsUUID()
  periodId!: string;
  @IsUUID()
  operationKey!: string;
  @IsString()
  @MaxLength(10)
  date!: string;
  @IsString()
  @MaxLength(500)
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
  @Post('accounts')
  account(@Body() dto: CodeDto, @CurrentUserId() actor: string) {
    return this.service.account(dto.code, dto.name, actor);
  }
  @Post('journals')
  journal(@Body() dto: CodeDto, @CurrentUserId() actor: string) {
    return this.service.journal(dto.code, dto.name, actor);
  }
  @Post('periods')
  period(@Body() dto: PeriodDto, @CurrentUserId() actor: string) {
    return this.service.period(dto.name, dto.start, dto.end, actor);
  }
  @Post('periods/:id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actor: string) {
    return this.service.close(id, actor);
  }
  @Post('entries')
  post(@Body() dto: PostingDto, @CurrentUserId() actor: string) {
    return this.service.post(dto, actor);
  }
  @Post('entries/:id/reverse')
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseDto, @CurrentUserId() actor: string) {
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
