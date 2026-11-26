import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../../infrastructure/http/page-query.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { ProductsService } from '../application/products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
class ProductsProductSearchDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  @SwaggerField({ required: false, enum: ['true', 'false'] })
  active?: string;
  @IsOptional()
  @IsIn(['true', 'false'])
  @SwaggerField({ required: false, enum: ['true', 'false'] })
  isSolarPlant?: string;
  @IsOptional()
  @IsUUID()
  @SwaggerField({ required: false, type: String, format: 'uuid' })
  categoryId?: string;
  @IsOptional() @IsUUID() @SwaggerField({ required: false, type: String, format: 'uuid' }) brandId?: string;
  @IsOptional()
  @IsUUID()
  @SwaggerField({ required: false, type: String, format: 'uuid' })
  taxRegimeId?: string;
}
@ApiTags('Produits')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}
  @Get() @RequirePermissions('products.read') list(@Query('active') active?: string) {
    if (active !== undefined && active !== 'true' && active !== 'false')
      throw new BadRequestException('Le filtre active doit être true ou false.');
    return this.products.list(active === undefined ? undefined : active === 'true');
  }
  @Get('search')
  @RequirePermissions('products.read')
  search(@Query() query: ProductsProductSearchDto) {
    const { active, isSolarPlant, ...filters } = query;
    return this.products.search({
      ...filters,
      active: active === undefined ? undefined : active === 'true',
      isSolarPlant: isSolarPlant === undefined ? undefined : isSolarPlant === 'true',
    });
  }
  @Get(':id') @RequirePermissions('products.read') get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.get(id);
  }
  @Post() @RequirePermissions('products.manage') @SuccessMessage('Produit créé avec succès.') create(
    @Body() dto: CreateProductDto,
  ) {
    return this.products.create(dto);
  }
  @Patch(':id') @RequirePermissions('products.manage') @SuccessMessage('Produit mis à jour.') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto);
  }
  @Patch(':id/activate') @RequirePermissions('products.manage') @SuccessMessage('Produit activé.') activate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.products.setActive(id, true);
  }
  @Patch(':id/deactivate')
  @RequirePermissions('products.manage')
  @SuccessMessage('Produit désactivé.')
  deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.setActive(id, false);
  }
}
