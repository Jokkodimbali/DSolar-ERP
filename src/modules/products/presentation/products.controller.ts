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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { ProductsService } from '../application/products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
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
