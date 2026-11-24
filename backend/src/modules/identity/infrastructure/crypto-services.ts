import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { validatedJwtSecrets } from './jwt-configuration';
import { validSessionClaims } from '../domain/session-claims';
import { AccessClaims, PasswordService, RefreshClaims, TokenService } from '../application/ports';

@Injectable()
export class ArgonPasswordService implements PasswordService {
  hash(value: string): Promise<string> {
    return argon2.hash(value, { type: argon2.argon2id });
  }
  async verify(hash: string, value: string): Promise<boolean> {
    return argon2.verify(hash, value);
  }
}

@Injectable()
export class JwtTokenService implements TokenService {
  constructor(private readonly jwt: JwtService) {}
  signAccess(claims: AccessClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.secret('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
      algorithm: 'HS256',
    });
  }
  signRefresh(claims: RefreshClaims): Promise<string> {
    return this.jwt.signAsync(
      { ...claims, jti: claims.jti ?? randomUUID() },
      {
        secret: this.secret('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
        algorithm: 'HS256',
      },
    );
  }
  async verifyAccess(token: string): Promise<AccessClaims> {
    const claims = await this.jwt.verifyAsync<AccessClaims>(token, {
      secret: this.secret('JWT_ACCESS_SECRET'),
      algorithms: ['HS256'],
    });
    if (!validSessionClaims(claims, 'access', Math.floor(Date.now() / 1000)))
      throw new UnauthorizedException('Jeton invalide.');
    return claims;
  }
  async verifyRefresh(token: string): Promise<RefreshClaims> {
    const claims = await this.jwt.verifyAsync<RefreshClaims>(token, {
      secret: this.secret('JWT_REFRESH_SECRET'),
      algorithms: ['HS256'],
    });
    if (!validSessionClaims(claims, 'refresh', Math.floor(Date.now() / 1000)))
      throw new UnauthorizedException('Jeton invalide.');
    return claims;
  }
  private secret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): string {
    return validatedJwtSecrets(process.env)[name];
  }
}
