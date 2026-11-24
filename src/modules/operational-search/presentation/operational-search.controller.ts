import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../infrastructure/http/page-query.dto';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { OperationalSearchService } from '../application/operational-search.service';

class OperationalQueryDto extends PageQueryDto {
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsUUID() storeId?: string;
  @IsOptional() @IsUUID() periodId?: string;
}

@ApiTags('Recherche des opérations')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('search')
export class OperationalSearchController {
  constructor(private readonly service: OperationalSearchService) {}
  @Get('stores')
  @RequirePermissions('stores.read')
  stores(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto) {
    return this.service.search('stores', actor, query);
  }

  @Get('users')
  @RequirePermissions('users.manage')
  users(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto) {
    return this.service.search('users', actor, query);
  }

  @Get('stocks')
  @RequirePermissions('inventory.read')
  stocks(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto) {
    return this.service.search('stocks', actor, query);
  }

  @Get('transfers')
  @RequirePermissions('inventory.read')
  transfers(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto) {
    return this.service.search('transfers', actor, query);
  }

  @Get('counts')
  @RequirePermissions('inventory.read')
  counts(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto) {
    return this.service.search('counts', actor, query);
  }

  @Get('expenses')
  @RequirePermissions('users.manage')
  expenses(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto) {
    return this.service.search('expenses', actor, query);
  }

  @Get('returns')
  @RequirePermissions('users.manage')
  returns(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto) {
    return this.service.search('returns', actor, query);
  }

  @Get('registers')
  @RequirePermissions('users.manage')
  registers(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto) {
    return this.service.search('registers', actor, query);
  }

  @Get('entries')
  @RequirePermissions('users.manage')
  entries(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto) {
    return this.service.search('entries', actor, query);
  }

  @Get('bank-statements')
  @RequirePermissions('users.manage')
  bankStatements(@CurrentUserId() actor: string, @Query() query: OperationalQueryDto) {
    return this.service.search('bank-statements', actor, query);
  }
}
