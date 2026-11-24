import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { CompanySettingsInput } from '../application/company-settings.port';
import { CompanySettingsService } from '../application/company-settings.service';

class CompanySettingsCompanySettingsDto implements CompanySettingsInput {
  @IsInt() @Min(0) @Max(2147483646) @SwaggerField({ type: 'integer', minimum: 0, maximum: 2147483646 }) expectedRevision!: number;
  @IsString() @MaxLength(180) @SwaggerField({ type: String, maxLength: 180 }) legalName!: string;
  @IsString() @MaxLength(180) @SwaggerField({ type: String, maxLength: 180 }) tradeName!: string;
  @IsString() @MaxLength(80) @SwaggerField({ type: String, maxLength: 80 }) taxId!: string;
  @IsString() @MaxLength(100) @SwaggerField({ type: String, maxLength: 100 }) registrationNumber!: string;
  @IsString() @MaxLength(100) @SwaggerField({ type: String, maxLength: 100 }) legalForm!: string;
  @IsString() @MaxLength(500) @SwaggerField({ type: String, maxLength: 500 }) address!: string;
  @IsString() @MaxLength(60) @SwaggerField({ type: String, maxLength: 60 }) phone!: string;
  @IsString() @MaxLength(254) @SwaggerField({ type: String, maxLength: 254 }) email!: string;
  @IsString() @MaxLength(300) @SwaggerField({ type: String, maxLength: 300 }) website!: string;
  @IsString() @MaxLength(500) @SwaggerField({ type: String, maxLength: 500 }) logoUrl!: string;
  @IsString() @MaxLength(180) @SwaggerField({ type: String, maxLength: 180 }) bankName!: string;
  @IsString() @MaxLength(180) @SwaggerField({ type: String, maxLength: 180 }) bankAccount!: string;
  @IsString() @MaxLength(500) @SwaggerField({ type: String, maxLength: 500 }) documentFooter!: string;
  @IsOptional() @IsString() @MaxLength(80) @SwaggerField({ required: false, type: String, maxLength: 80 }) timeZone?: string;
  @IsBoolean() @SwaggerField({ type: Boolean }) notificationsEnabled!: boolean;
  @IsInt() @Min(0) @Max(1000000) @SwaggerField({ type: 'integer', minimum: 0, maximum: 1000000 }) lowStockThreshold!: number;
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
  @SuccessMessage('Paramètres de l’entreprise enregistrés avec succès.')
  save(@CurrentUserId() actorId: string, @Body() body: CompanySettingsCompanySettingsDto) {
    const { expectedRevision, ...input } = body;
    return this.service.save(actorId, expectedRevision, input);
  }
}
