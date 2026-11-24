import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IMAGE_REPOSITORY, ImageKind, ImageRepository } from './image.port';
import { preparePdfImage } from '../../../shared/pdf-image';
import { validateImage } from '../domain/image-validation';

@Injectable()
export class ImageService {
  constructor(@Inject(IMAGE_REPOSITORY) private readonly repository: ImageRepository) {}

  async upload(actorId: string, kind: ImageKind, data?: Buffer, productId?: string) {
    const mimeType = validateImage(data);
    if (!data) throw new Error('Image manquante après validation.');
    {
      try {
        preparePdfImage(data, mimeType);
      } catch {
        throw new BadRequestException(
          'Image corrompue ou incompatible : utilisez un JPEG RVB ou un PNG 8 bits non entrelacé, de 4 mégapixels maximum.',
        );
      }
    }
    const image = await this.repository.save(actorId, { kind, productId, mimeType, data });
    return { ...image, url: '/api/v1/media/images/' + image.id, message: 'Image téléversée avec succès.' };
  }

  async get(actorId: string, id: string) {
    const image = await this.repository.get(actorId, id);
    if (!image) throw new NotFoundException('Image introuvable.');
    return image;
  }

  async latestProduct(actorId: string, productId: string) {
    const image = await this.repository.latestProduct(actorId, productId);
    return image ? { ...image, url: '/api/v1/media/images/' + image.id } : null;
  }
}
