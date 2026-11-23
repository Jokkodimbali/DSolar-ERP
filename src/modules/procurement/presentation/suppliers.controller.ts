import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { SuppliersService } from '../application/suppliers.service';

export class SupplierDto {
  @IsString() @IsNotEmpty() @MaxLength(180) name!: string;
  @IsOptional() @IsString() @MaxLength(100) taxId?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
export class UpdateSupplierDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(180) name?: string;
  @IsOptional() @IsString() @MaxLength(100) taxId?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
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
  @Post() @RequirePermissions('inventory.manage') create(@Body() dto: SupplierDto) {
    return this.suppliers.create(dto);
  }
  @Patch(':id') @RequirePermissions('inventory.manage') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliers.update(id, dto);
  }
  @Post(':id/activate') @RequirePermissions('inventory.manage') activate(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.suppliers.activate(id);
  }
  @Post(':id/deactivate') @RequirePermissions('inventory.manage') deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.suppliers.deactivate(id);
  }
}
