import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { CompanySettingsInput } from '../application/company-settings.port';
import { CompanySettingsService } from '../application/company-settings.service';

class CompanySettingsDto implements CompanySettingsInput {
  @IsInt() @Min(0) @Max(2147483646) expectedRevision!: number;
  @IsString() @MaxLength(180) legalName!: string;
  @IsString() @MaxLength(180) tradeName!: string;
  @IsString() @MaxLength(80) taxId!: string;
  @IsString() @MaxLength(100) registrationNumber!: string;
  @IsString() @MaxLength(100) legalForm!: string;
  @IsString() @MaxLength(500) address!: string;
  @IsString() @MaxLength(60) phone!: string;
  @IsString() @MaxLength(254) email!: string;
  @IsString() @MaxLength(300) website!: string;
  @IsString() @MaxLength(500) logoUrl!: string;
  @IsString() @MaxLength(180) bankName!: string;
  @IsString() @MaxLength(180) bankAccount!: string;
  @IsString() @MaxLength(500) documentFooter!: string;
  @IsBoolean() notificationsEnabled!: boolean;
  @IsInt() @Min(0) @Max(1000000) lowStockThreshold!: number;
}

@ApiTags('Paramètres entreprise')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@RequirePermissions('users.manage')
@Controller('settings/company')
export class CompanySettingsController {
  constructor(private readonly service: CompanySettingsService) {}

  @Get()
  get(@CurrentUserId() actorId: string) {
    return this.service.current(actorId);
  }

  @Put()
  save(@CurrentUserId() actorId: string, @Body() body: CompanySettingsDto) {
    const { expectedRevision, ...input } = body;
    return this.service.save(actorId, expectedRevision, input);
  }
}
