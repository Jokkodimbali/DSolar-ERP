import { NextFunction, Request, Response } from 'express';
import { configuredOrigins, securityHeaders, trustedProxyHops } from './http-security';

describe('Sécurité HTTP transversale', () => {
  it('interdit la mise en cache et supprime les informations de framework', () => {
    const response = { removeHeader: jest.fn(), setHeader: jest.fn() };
    const next = jest.fn();
    securityHeaders({} as Request, response as unknown as Response, next as NextFunction);
    expect(response.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(response.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(response.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('refuse les origines génériques ou contenant un chemin', () => {
    expect(() => configuredOrigins('*')).toThrow();
    expect(() => configuredOrigins('https://example.test/path')).toThrow();
    expect(configuredOrigins(' https://example.test,https://example.test ')).toEqual([
      'https://example.test',
    ]);
  });

  it('ne divulgue pas une origine malformée dans les erreurs de configuration', () => {
    const secret = 'secret-ne-pas-exposer';
    expect(() => configuredOrigins(secret)).toThrow(
      'CORS_ORIGINS doit contenir uniquement des origines HTTP(S) explicites.',
    );
    try {
      configuredOrigins(secret);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(error).not.toHaveProperty('input');
    }
  });

  it('applique une politique de contenu stricte en production', () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const response = { removeHeader: jest.fn(), setHeader: jest.fn() };
      securityHeaders({} as Request, response as unknown as Response, jest.fn() as NextFunction);
      expect(response.setHeader).toHaveBeenCalledWith('Strict-Transport-Security', 'max-age=31536000');
      expect(response.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      );
      expect(() => configuredOrigins('http://example.test')).toThrow();
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('ne fait confiance à aucun proxy par défaut', () => {
    expect(trustedProxyHops(undefined)).toBe(0);
    expect(trustedProxyHops('1')).toBe(1);
    expect(() => trustedProxyHops('true')).toThrow();
    expect(() => trustedProxyHops('99')).toThrow();
  });
});
