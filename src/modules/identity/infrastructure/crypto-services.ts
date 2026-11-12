import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { AccessClaims, PasswordService, RefreshClaims, TokenService } from '../application/ports';

@Injectable()
export class ArgonPasswordService implements PasswordService {
  hash(value: string): Promise<string> { return argon2.hash(value, { type: argon2.argon2id }); }
  async verify(hash: string, value: string): Promise<boolean> { return argon2.verify(hash, value); }
}

@Injectable()
export class JwtTokenService implements TokenService {
  constructor(private readonly jwt: JwtService) {}
  signAccess(claims: AccessClaims): Promise<string> {
    return this.jwt.signAsync(claims, { secret: this.secret('JWT_ACCESS_SECRET'), expiresIn: '15m' });
  }
  signRefresh(claims: RefreshClaims): Promise<string> {
    return this.jwt.signAsync(claims, { secret: this.secret('JWT_REFRESH_SECRET'), expiresIn: '7d', jwtid: randomUUID() });
  }
  async verifyAccess(token: string): Promise<AccessClaims> {
    const claims = await this.jwt.verifyAsync<AccessClaims>(token, { secret: this.secret('JWT_ACCESS_SECRET') });
    if (claims.typ !== 'access' || !claims.sub || !Number.isInteger(claims.ver)) throw new UnauthorizedException('Jeton invalide.');
    return claims;
  }
  async verifyRefresh(token: string): Promise<RefreshClaims> {
    const claims = await this.jwt.verifyAsync<RefreshClaims>(token, { secret: this.secret('JWT_REFRESH_SECRET') });
    if (claims.typ !== 'refresh' || !claims.sub || !claims.sid) throw new UnauthorizedException('Jeton invalide.');
    return claims;
  }
  private secret(name: string): string {
    const secret = process.env[name];
    if (!secret || secret.length < 32) throw new Error(`Configuration requise : ${name} (32 caractères minimum)`);
    return secret;
  }
}
