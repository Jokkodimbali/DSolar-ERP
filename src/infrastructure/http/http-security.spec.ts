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
    expect(configuredOrigins(' https://example.test,https://example.test ')).toEqual(['https://example.test']);
  });

  it('ne fait confiance à aucun proxy par défaut', () => {
    expect(trustedProxyHops(undefined)).toBe(0);
    expect(trustedProxyHops('1')).toBe(1);
    expect(() => trustedProxyHops('true')).toThrow();
    expect(() => trustedProxyHops('99')).toThrow();
  });
});
