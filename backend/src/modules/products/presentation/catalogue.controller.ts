import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CatalogueService } from '../application/catalogue.service';
import {
  CreateBrandDto,
  CreateCategoryDto,
  CreateTaxRegimeDto,
  SetProductPriceDto,
  RenameReferenceDto,
} from './dto/catalogue.dto';
@ApiTags('Catalogue')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller()
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}
  @Get('categories') @RequirePermissions('products.read') categories() {
    return this.catalogue.list('category');
  }
  @Post('categories')
  @RequirePermissions('products.manage')
  @SuccessMessage('Catégorie créée.')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogue.createCategory(dto);
  }
  @Get('brands') @RequirePermissions('products.read') brands() {
    return this.catalogue.list('brand');
  }
  @Post('brands') @RequirePermissions('products.manage') @SuccessMessage('Marque créée.') createBrand(
    @Body() dto: CreateBrandDto,
  ) {
    return this.catalogue.createBrand(dto);
  }
  @Get('tax-regimes') @RequirePermissions('products.read') taxRegimes() {
    return this.catalogue.list('taxRegime');
  }
  @Post('tax-regimes')
  @RequirePermissions('products.manage')
  @SuccessMessage('Régime fiscal créé.')
  createTaxRegime(@Body() dto: CreateTaxRegimeDto) {
    return this.catalogue.createTaxRegime(dto);
  }
  @Patch('categories/:id')
  @RequirePermissions('products.manage')
  @SuccessMessage('Catégorie mise à jour.')
  renameCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenameReferenceDto) {
    return this.catalogue.renameReference('category', id, dto.name);
  }

  @Patch('brands/:id')
  @RequirePermissions('products.manage')
  @SuccessMessage('Marque mise à jour.')
  renameBrand(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenameReferenceDto) {
    return this.catalogue.renameReference('brand', id, dto.name);
  }

  @Patch('tax-regimes/:id')
  @RequirePermissions('products.manage')
  @SuccessMessage('Libellé fiscal mis à jour.')
  renameTaxRegime(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenameReferenceDto) {
    return this.catalogue.renameReference('taxRegime', id, dto.name);
  }

  @Delete('categories/:id')
  @RequirePermissions('products.manage')
  @SuccessMessage('Catégorie inutilisée supprimée.')
  async deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    await this.catalogue.deleteReference('category', id);
    return { message: 'Catégorie supprimée.' };
  }

  @Delete('brands/:id')
  @RequirePermissions('products.manage')
  @SuccessMessage('Marque inutilisée supprimée.')
  async deleteBrand(@Param('id', ParseUUIDPipe) id: string) {
    await this.catalogue.deleteReference('brand', id);
    return { message: 'Marque supprimée.' };
  }

  @Get('products/:id/prices') @RequirePermissions('products.read') prices(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.catalogue.prices(id);
  }
  @Post('products/:id/prices')
  @RequirePermissions('products.manage')
  @SuccessMessage('Tarif produit enregistré.')
  setPrice(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SetProductPriceDto) {
    return this.catalogue.setPrice(id, dto);
  }
}
