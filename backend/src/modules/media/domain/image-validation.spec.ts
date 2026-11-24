import { validateImage, MAX_IMAGE_BYTES } from './image-validation';

describe('Validation des fichiers image', () => {
  it('accepte un PNG de 1 pixel', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DQAAAEgQGALFXOsAAAAABJRU5ErkJggg==',
      'base64',
    );
    expect(validateImage(png)).toBe('image/png');
  });
  it('refuse un fichier texte ou SVG', () => {
    expect(() => validateImage(Buffer.from('<svg onload="alert(1)"/>'))).toThrow('Image invalide');
  });
  it('refuse les fichiers trop volumineux', () => {
    expect(() => validateImage(Buffer.alloc(MAX_IMAGE_BYTES + 1))).toThrow('2 Mo');
  });
  it('refuse les fichiers absents', () => {
    expect(() => validateImage(undefined)).toThrow('Sélectionnez une image');
  });
});
