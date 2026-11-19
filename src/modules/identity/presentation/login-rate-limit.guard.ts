import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly windowMs = 15 * 60 * 1000;
  private readonly maxAttempts = 10;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const email =
      typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase().slice(0, 254) : '';
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const key = `${ip}:${email}`;
    const now = Date.now();
    const existing = this.attempts.get(key);
    const entry =
      !existing || existing.resetAt <= now ? { count: 0, resetAt: now + this.windowMs } : existing;
    if (entry.count >= this.maxAttempts) {
      throw new HttpException(
        'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    entry.count += 1;
    this.attempts.set(key, entry);
    if (this.attempts.size > 10000) {
      for (const [candidate, value] of this.attempts) {
        if (value.resetAt <= now) this.attempts.delete(candidate);
      }
    }
    return true;
  }
}
