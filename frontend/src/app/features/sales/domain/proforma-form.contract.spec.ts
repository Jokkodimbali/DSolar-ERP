import { describe, expect, it } from 'vitest';
import { expiryInput, keepSelected, localExpiry } from './proforma-form.contract';

describe('Formulaire de devis', () => {
  it('conserve les références sélectionnées hors de la page courante', () => {
    const old = [
      { id: 'a', name: 'Client A' },
      { id: 'b', name: 'Client B' },
    ];
    const next = [{ id: 'c', name: 'Client C' }];
    expect(keepSelected(old, next, ['a'])).toEqual([old[0], next[0]]);
  });

  it('conserve une date exacte existante et refuse les dates invalides ou expirées', () => {
    const original = '2030-01-01T12:34:56.123Z';
    const local = localExpiry(original);
    expect(expiryInput(local, original, 0)).toBe(original);
    expect(expiryInput('', original, 0)).toBeUndefined();
    expect(() => expiryInput('2030-02-31T12:00', null, 0)).toThrow();
    expect(() => expiryInput(local, original, Date.parse(original))).toThrow();
  });
});
