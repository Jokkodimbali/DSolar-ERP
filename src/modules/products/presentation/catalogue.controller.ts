import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CatalogueService } from '../application/catalogue.service';
import { CreateBrandDto, CreateCategoryDto, CreateTaxRegimeDto, SetProductPriceDto } from './dto/catalogue.dto';
@ApiTags('Catalogue') @ApiBearerAuth() @UseGuards(AccessGuard) @Controller()
export class CatalogueController {
 constructor(private readonly catalogue: CatalogueService) {}
 @Get('categories') @RequirePermissions('products.read') categories() { return this.catalogue.list('category'); }
 @Post('categories') @RequirePermissions('products.manage') createCategory(@Body() dto: CreateCategoryDto) { return this.catalogue.createCategory(dto); }
 @Get('brands') @RequirePermissions('products.read') brands() { return this.catalogue.list('brand'); }
 @Post('brands') @RequirePermissions('products.manage') createBrand(@Body() dto: CreateBrandDto) { return this.catalogue.createBrand(dto); }
 @Get('tax-regimes') @RequirePermissions('products.read') taxRegimes() { return this.catalogue.list('taxRegime'); }
 @Post('tax-regimes') @RequirePermissions('products.manage') createTaxRegime(@Body() dto: CreateTaxRegimeDto) { return this.catalogue.createTaxRegime(dto); }
 @Get('products/:id/prices') @RequirePermissions('products.read') prices(@Param('id',new ParseUUIDPipe()) id: string) { return this.catalogue.prices(id); }
 @Post('products/:id/prices') @RequirePermissions('products.manage') setPrice(@Param('id',new ParseUUIDPipe()) id: string, @Body() dto: SetProductPriceDto) { return this.catalogue.setPrice(id,dto); }
}
