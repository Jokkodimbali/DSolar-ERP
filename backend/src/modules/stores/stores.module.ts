import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { StoreAccessUseCases } from './application/store-access.use-cases';
import { STORE_ACCESS_REPOSITORY } from './application/store-access.repository';
import { PrismaStoreAccessRepository } from './infrastructure/prisma-store-access.repository';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { StoresUseCases } from './application/stores.use-cases';
import { STORE_REPOSITORY } from './application/store.repository';
import { PrismaStoreRepository } from './infrastructure/prisma-store.repository';
import { StoresController } from './presentation/stores.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [StoresController],
  providers: [
    StoresUseCases,
    StoreAccessUseCases,
    { provide: STORE_ACCESS_REPOSITORY, useClass: PrismaStoreAccessRepository },
    { provide: STORE_REPOSITORY, useClass: PrismaStoreRepository },
  ],
})
export class StoresModule {}
