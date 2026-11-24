import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export function securityHeaders(_request: Request, response: Response, next: NextFunction) {
  response.removeHeader('X-Powered-By');
  response.setHeader('Cache-Control', 'no-store, private');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('X-Request-Id', randomUUID());
  if (process.env.NODE_ENV === 'production') {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
}

export function configuredOrigins(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const url = new URL(item);
          if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.origin !== item ||
            url.username ||
            url.password
          )
            throw new Error('CORS_ORIGINS doit contenir uniquement des origines HTTP(S) explicites.');
          if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
            throw new Error('CORS_ORIGINS exige HTTPS en production.');
          return url.origin;
        }),
    ),
  ];
}

export function trustedProxyHops(value: string | undefined): number {
  const raw = value ?? '0';
  if (!/^[0-5]$/.test(raw)) throw new Error('TRUST_PROXY_HOPS doit être un entier entre 0 et 5.');
  return Number(raw);
}
