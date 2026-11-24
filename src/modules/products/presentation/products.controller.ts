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
class ProductSearchDto extends PageQueryDto {
  @IsOptional() @IsIn(['true', 'false']) active?: string;
  @IsOptional() @IsIn(['true', 'false']) isSolarPlant?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsUUID() taxRegimeId?: string;
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
  @Get('search') @RequirePermissions('products.read')
  search(@Query() query: ProductSearchDto) {
    const { active, isSolarPlant, ...filters } = query;
    return this.products.search({ ...filters,
      active: active === undefined ? undefined : active === 'true',
      isSolarPlant: isSolarPlant === undefined ? undefined : isSolarPlant === 'true',
    });
  }
  @Get(':id') @RequirePermissions('products.read') get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.get(id);
  }
  @Post() @RequirePermissions('products.manage') create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }
  @Patch(':id') @RequirePermissions('products.manage') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto);
  }
  @Patch(':id/activate') @RequirePermissions('products.manage') activate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.products.setActive(id, true);
  }
  @Patch(':id/deactivate') @RequirePermissions('products.manage') deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.products.setActive(id, false);
  }
}
