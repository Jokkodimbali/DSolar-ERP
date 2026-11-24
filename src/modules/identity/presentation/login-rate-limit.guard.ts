import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { createHash } from 'node:crypto';

interface Attempt {
  count: number;
  resetAt: number;
}

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, Attempt>();
  private readonly windowMs = 15 * 60 * 1000;
  private readonly maxKeys = 10000;
  private lastSweep = 0;

  private reject(): never {
    throw new HttpException('Trop de tentatives. Réessayez ultérieurement.', HttpStatus.TOO_MANY_REQUESTS);
  }

  private consume(key: string, limit: number, now: number) {
    const previous = this.attempts.get(key);
    const entry = previous && previous.resetAt > now ? previous : { count: 0, resetAt: now + this.windowMs };
    if (entry.count >= limit) this.reject();
    if (!previous && this.attempts.size >= this.maxKeys) this.reject();
    entry.count++;
    this.attempts.set(key, entry);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    if (now - this.lastSweep >= 60000) {
      for (const [key, value] of this.attempts) if (value.resetAt <= now) this.attempts.delete(key);
      this.lastSweep = now;
    }
    // Express resolves the client IP only through explicitly configured trusted proxy hops.
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const endpoint = request.path?.endsWith('/refresh')
      ? 'refresh'
      : request.path?.endsWith('/logout')
        ? 'logout'
        : 'login';
    this.consume(endpoint + ':ip:' + ip, endpoint === 'login' ? 60 : 120, now);
    if (endpoint === 'login') {
      const email =
        typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase().slice(0, 254) : '';
      const digest = createHash('sha256').update(email).digest('hex');
      this.consume('login:pair:' + ip + ':' + digest, 10, now);
    }
    return true;
  }
}
