import { describe, expect, it } from 'vitest';
import { documentFilename, documentPath, validatePdf } from './sales-document.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const orderId = 'c31ac59c-8148-4664-8745-496a9618f203';

describe('Documents commerciaux', () => {
  it('construit uniquement des chemins API internes et des noms sûrs', () => {
    const delivery = { kind: 'delivery', id, orderId } as const;
    expect(documentPath(delivery)).toBe('/api/v1/sales-orders/' + orderId + '/deliveries/' + id + '/pdf');
    expect(documentFilename(delivery)).toBe('livraison-' + id + '.pdf');
    expect(documentPath({ kind: 'proforma', id })).toBe('/api/v1/proformas/' + id + '/pdf');
    expect(() => documentPath({ ...delivery, orderId: '../autre' })).toThrow();
  });

  it('refuse les réponses JSON, vides et les signatures invalides', async () => {
    const pdf = new Blob(['%PDF-1.4\ncontenu'], { type: 'application/pdf' });
    await expect(validatePdf(pdf)).resolves.toBe(pdf);
    await expect(validatePdf(new Blob(['%PDF-1.4'], { type: 'application/json' }))).rejects.toThrow();
    await expect(validatePdf(new Blob([''], { type: 'application/pdf' }))).rejects.toThrow();
    await expect(
      validatePdf(new Blob(['<html>erreur</html>'], { type: 'application/pdf' })),
    ).rejects.toThrow();
  });
});
