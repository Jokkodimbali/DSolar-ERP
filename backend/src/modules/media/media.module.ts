import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { IMAGE_REPOSITORY } from './application/image.port';
import { ImageService } from './application/image.service';
import { PrismaImageRepository } from './infrastructure/prisma-image.repository';
import { ImageController } from './presentation/image.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [ImageController],
  providers: [ImageService, { provide: IMAGE_REPOSITORY, useClass: PrismaImageRepository }],
})
export class MediaModule {}
