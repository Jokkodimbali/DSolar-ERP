import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response, CookieOptions } from 'express';

const name = 'dsolar_refresh';
const options = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth/browser',
});

export function requireBrowserRequest(request: Request): void {
  // Une requête cross-origin ne peut pas envoyer cet en-tête sans préflight CORS autorisé.
  // Le cookie SameSite=Strict apporte une protection supplémentaire contre le CSRF.
  if (request.get('X-DSolar-Browser') !== '1')
    throw new ForbiddenException('Requête de session non autorisée.');
}

export function browserRefreshToken(request: Request): string {
  const entries = (request.headers.cookie ?? '').split(';').map((entry) => entry.trim());
  const tokens = entries.filter((entry) => entry.startsWith(name + '='));
  const token = tokens.length === 1 ? tokens[0].slice(name.length + 1) : '';
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || token.length > 4096)
    throw new UnauthorizedException('Session invalide.');
  return token;
}

export function setBrowserSession(response: Response, token: string): void {
  response.cookie(name, token, { ...options(), maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function clearBrowserSession(response: Response): void {
  response.clearCookie(name, options());
}
