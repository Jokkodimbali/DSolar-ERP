import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { AUTH_RATE_LIMIT, AuthRateLimit } from '../application/auth-rate-limit.port';

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(@Inject(AUTH_RATE_LIMIT) private readonly limiter: AuthRateLimit) {}

  private async consume(key: string, limit: number) {
    const digest = createHash('sha256').update(key).digest('hex');
    let allowed: boolean;
    try {
      allowed = await this.limiter.consume(digest, limit);
    } catch {
      // Never fall back to an unprotected login if the shared store is unavailable.
      throw new ServiceUnavailableException('Authentification temporairement indisponible.');
    }
    if (!allowed)
      throw new HttpException('Trop de tentatives. Réessayez ultérieurement.', HttpStatus.TOO_MANY_REQUESTS);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    // Use handler metadata, not a user-controlled path (including trailing slashes or casing).
    const handler = context.getHandler().name;
    const endpoint = handler === 'refresh' || handler === 'logout' ? handler : 'login';
    await this.consume(endpoint + ':ip:' + ip, endpoint === 'login' ? 60 : 120);
    if (endpoint === 'login') {
      const body: unknown = request.body;
      const value = body && typeof body === 'object' && 'email' in body ? body.email : undefined;
      const email = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : '';
      await this.consume('login:pair:' + ip + ':' + email, 10);
    }
    return true;
  }
}
