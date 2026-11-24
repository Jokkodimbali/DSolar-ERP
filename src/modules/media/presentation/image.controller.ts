import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { AuthenticatedOnly } from '../../identity/presentation/route-policy';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { ImageService } from '../application/image.service';
import { MAX_IMAGE_BYTES } from '../domain/image-validation';

interface UploadedImage {
  buffer: Buffer;
}

const uploadLimits = { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 1 } };

@ApiTags('Images')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('media')
export class ImageController {
  constructor(private readonly images: ImageService) {}

  @Post('company/logo')
  @RequirePermissions('users.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadLimits))
  @SuccessMessage('Logo téléversé avec succès.')
  logo(@CurrentUserId() actorId: string, @UploadedFile() file?: UploadedImage) {
    return this.images.upload(actorId, 'COMPANY_LOGO', file?.buffer);
  }

  @Post('products/:id/photo')
  @RequirePermissions('products.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadLimits))
  @SuccessMessage('Photo du produit téléversée avec succès.')
  photo(
    @CurrentUserId() actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: UploadedImage,
  ) {
    return this.images.upload(actorId, 'PRODUCT_PHOTO', file?.buffer, id);
  }

  @Get('products/:id/photo')
  @RequirePermissions('products.read')
  latest(@CurrentUserId() actorId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.images.latestProduct(actorId, id);
  }

  @Get('images/:id')
  @AuthenticatedOnly()
  async get(@CurrentUserId() actorId: string, @Param('id', ParseUUIDPipe) id: string) {
    const image = await this.images.get(actorId, id);
    return new StreamableFile(Buffer.from(image.data), { type: image.mimeType, disposition: 'inline' });
  }
}
