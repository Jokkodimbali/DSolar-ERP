import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { SuppliersService } from '../application/suppliers.service';

export class SupplierDto {
  @IsString() @IsNotEmpty() @MaxLength(180) @SwaggerField({ type: String, maxLength: 180 }) name!: string;
  @IsOptional() @IsString() @MaxLength(100) @SwaggerField({ required: false, type: String, maxLength: 100 }) taxId?: string;
  @IsOptional() @IsString() @MaxLength(50) @SwaggerField({ required: false, type: String, maxLength: 50 }) phone?: string;
  @IsOptional() @IsEmail() @SwaggerField({ required: false, type: String, format: 'email' }) email?: string;
  @IsOptional() @IsString() @MaxLength(500) @SwaggerField({ required: false, type: String, maxLength: 500 }) address?: string;
}
export class UpdateSupplierDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(180) @SwaggerField({ required: false, type: String, maxLength: 180 }) name?: string;
  @IsOptional() @IsString() @MaxLength(100) @SwaggerField({ required: false, type: String, maxLength: 100 }) taxId?: string;
  @IsOptional() @IsString() @MaxLength(50) @SwaggerField({ required: false, type: String, maxLength: 50 }) phone?: string;
  @IsOptional() @IsEmail() @SwaggerField({ required: false, type: String, format: 'email' }) email?: string;
  @IsOptional() @IsString() @MaxLength(500) @SwaggerField({ required: false, type: String, maxLength: 500 }) address?: string;
}
@ApiTags('Fournisseurs')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}
  @Get() @RequirePermissions('inventory.read') list() {
    return this.suppliers.list();
  }
  @Get(':id') @RequirePermissions('inventory.read') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.get(id);
  }
  @Post() @RequirePermissions('inventory.manage') @SuccessMessage('Fournisseur créé.') create(
    @Body() dto: SupplierDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.suppliers.create(dto, actorId);
  }
  @Patch(':id') @RequirePermissions('inventory.manage') @SuccessMessage('Fournisseur mis à jour.') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.suppliers.update(id, dto, actorId);
  }
  @Post(':id/activate')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Fournisseur activé.')
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.suppliers.activate(id, actorId);
  }
  @Post(':id/deactivate')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Fournisseur désactivé.')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.suppliers.deactivate(id, actorId);
  }
}
