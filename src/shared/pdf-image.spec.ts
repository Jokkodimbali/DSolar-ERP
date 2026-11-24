import { preparePdfImage } from './pdf-image';

describe('Intégrité des images téléversées', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DQAAAEgQGALFXOsAAAAABJRU5ErkJggg==', 'base64');
  it('décode un PNG valide et conserve ses dimensions', () => {
    expect(preparePdfImage(png, 'image/png')).toMatchObject({ width: 1, height: 1 });
  });
  it('rejette un PNG dont le contenu a été altéré malgré une signature valide', () => {
    const corrupted = Buffer.from(png);
    corrupted[45] ^= 1;
    expect(() => preparePdfImage(corrupted, 'image/png')).toThrow();
  });
  it('rejette un faux JPEG contenant uniquement un en-tête de dimensions', () => {
    const fake = Buffer.from('ffd8ffc00011080001000103011100021100031100ffd9', 'hex');
    expect(() => preparePdfImage(fake, 'image/jpeg')).toThrow();
  });
});
