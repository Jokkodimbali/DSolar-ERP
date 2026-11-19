import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CustomersService } from '../application/customers.service';

export class CreateCustomerDto {
  @IsString() @IsNotEmpty() @MaxLength(180) name!: string;
  @IsOptional() @IsString() @MaxLength(100) taxId?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
export class UpdateCustomerDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(180) name?: string;
  @IsOptional() @IsString() @MaxLength(100) taxId?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
@ApiTags('Clients')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() @RequirePermissions('products.read') list() { return this.customers.list(); }
  @Get(':id') @RequirePermissions('products.read')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.customers.get(id); }
  @Post() @RequirePermissions('products.manage')
  create(@Body() dto: CreateCustomerDto) { return this.customers.create(dto); }
  @Patch(':id') @RequirePermissions('products.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }
}
