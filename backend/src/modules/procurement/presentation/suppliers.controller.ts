import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { SuppliersService } from '../application/suppliers.service';

export class SupplierDto {
  @IsOptional()
  @IsUUID('4')
  @SwaggerField({ required: false, type: String, format: 'uuid' })
  operationKey?: string;
  @IsString() @IsNotEmpty() @MaxLength(180) @SwaggerField({ type: String, maxLength: 180 }) name!: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @SwaggerField({ required: false, nullable: true, type: String, maxLength: 100 })
  taxId?: string | null;
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @SwaggerField({ required: false, nullable: true, type: String, maxLength: 50 })
  phone?: string | null;
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @SwaggerField({ required: false, nullable: true, type: String, format: 'email', maxLength: 254 })
  email?: string | null;
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @SwaggerField({ required: false, nullable: true, type: String, maxLength: 500 })
  address?: string | null;
}
export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  @SwaggerField({ required: false, type: String, maxLength: 180 })
  name?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @SwaggerField({ required: false, nullable: true, type: String, maxLength: 100 })
  taxId?: string | null;
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @SwaggerField({ required: false, nullable: true, type: String, maxLength: 50 })
  phone?: string | null;
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @SwaggerField({ required: false, nullable: true, type: String, format: 'email', maxLength: 254 })
  email?: string | null;
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @SwaggerField({ required: false, nullable: true, type: String, maxLength: 500 })
  address?: string | null;
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
    const { operationKey, ...input } = dto;
    return this.suppliers.create(input, actorId, operationKey);
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
