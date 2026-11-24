import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ImageMime } from '../application/image.port';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function validateImage(data: Buffer | undefined): ImageMime {
  if (!data?.length) throw new BadRequestException('Sélectionnez une image à téléverser.');
  if (data.length > MAX_IMAGE_BYTES) throw new PayloadTooLargeException('L’image ne doit pas dépasser 2 Mo.');
  if (data.length >= 45 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      data.readUInt32BE(8) === 13 && data.toString('ascii', 12, 16) === 'IHDR' &&
      data.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))) {
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 4096 || height > 4096)
      throw new BadRequestException('Les dimensions PNG doivent être comprises entre 1 et 4096 pixels.');
    return 'image/png';
  }
  if (data.length >= 20 && data[0] === 255 && data[1] === 216 && data[2] === 255 &&
      data[data.length - 2] === 255 && data[data.length - 1] === 217) {
    // Require a frame header and bound the decoded dimensions.
    let i = 2;
    while (i + 4 < data.length && data[i] === 255) {
      while (data[i] === 255) i++;
      const marker = data[i++];
      if (marker === 0xda || marker === 0xd9 || i + 2 > data.length) break;
      const length = data.readUInt16BE(i);
      if (length < 2 || i + length > data.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        const height = data.readUInt16BE(i + 3);
        const width = data.readUInt16BE(i + 5);
        if (width < 1 || height < 1 || width > 4096 || height > 4096)
          throw new BadRequestException('Les dimensions JPEG doivent être comprises entre 1 et 4096 pixels.');
        return 'image/jpeg';
      }
      i += length;
    }
  }
  throw new BadRequestException('Image invalide. Seuls les fichiers PNG et JPEG sont acceptés.');
}
