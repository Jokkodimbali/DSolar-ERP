import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { ProductsService } from './application/products.service';
import { PRODUCT_REPOSITORY } from './application/product.repository';
import { PrismaProductRepository } from './infrastructure/prisma-product.repository';
import { ProductsController } from './presentation/products.controller';
import { CatalogueController } from './presentation/catalogue.controller';
import { CatalogueService } from './application/catalogue.service';
import { CATALOGUE_REPOSITORY } from './application/catalogue.repository';
import { PrismaCatalogueRepository } from './infrastructure/prisma-catalogue.repository';
@Module({imports:[PrismaModule,IdentityModule],controllers:[ProductsController,CatalogueController],providers:[ProductsService,CatalogueService,{provide:CATALOGUE_REPOSITORY,useClass:PrismaCatalogueRepository},{provide:PRODUCT_REPOSITORY,useClass:PrismaProductRepository}]})
export class ProductsModule {}
