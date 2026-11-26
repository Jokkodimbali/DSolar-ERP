import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CustomersService } from '../application/customers.service';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';

export class CreateCustomerDto {
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
export class UpdateCustomerDto {
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
@ApiTags('Clients')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() @RequirePermissions('sales.read') list() {
    return this.customers.list();
  }
  @Get(':id')
  @RequirePermissions('sales.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.get(id);
  }
  @Post()
  @RequirePermissions('sales.manage')
  @SuccessMessage('Client créé avec succès.')
  create(@Body() dto: CreateCustomerDto, @CurrentUserId() actorId: string) {
    const { operationKey, ...input } = dto;
    return this.customers.create(input, actorId, operationKey);
  }
  @Patch(':id')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Informations du client mises à jour.')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.customers.update(id, dto, actorId);
  }
}
