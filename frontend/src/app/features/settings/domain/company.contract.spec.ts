import { describe, expect, it } from 'vitest';
import { blankCompany, companyInput, parseCompany, parseLogo } from './company.contract';

describe('Paramètres entreprise', () => {
  const input = { ...blankCompany(), legalName: 'DSolar' };

  it('traite une entreprise non configurée et contrôle la révision', () => {
    expect(parseCompany(null).revision).toBe(0);
    expect(parseCompany({ ...input, revision: 1 }).input).toEqual(input);
    expect(() => parseCompany({ ...input, revision: -1 })).toThrow();
  });

  it('refuse les URL externes de logo, les seuils incorrects et les sites non sécurisés', () => {
    expect(() => companyInput({ ...input, logoUrl: 'https://example.org/logo.png' })).toThrow();
    expect(() => companyInput({ ...input, lowStockThreshold: -1 })).toThrow();
    expect(() => companyInput({ ...input, website: 'http://example.org' })).toThrow();
  });

  it('vérifie le MIME et la référence du logo', () => {
    const id = 'c31ac59c-8148-4664-8745-496a9618f202';
    const url = '/api/v1/media/images/' + id;
    expect(parseLogo({ id, url, mimeType: 'image/png' })).toBe(url);
    expect(() => parseLogo({ id, url, mimeType: 'image/svg+xml' })).toThrow();
  });
});
