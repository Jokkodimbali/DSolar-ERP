import { IdentityUser, SessionRecord } from '../domain/identity.types';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
export const PASSWORD_SERVICE = Symbol('PASSWORD_SERVICE');
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface UserRepository {
  findByEmail(email: string): Promise<IdentityUser | null>;
  findById(id: string): Promise<IdentityUser | null>;
}
export interface SessionRepository {
  create(userId: string, tokenHash: string, expiresAt: Date): Promise<SessionRecord>;
  findById(id: string): Promise<SessionRecord | null>;
  rotate(id: string, expectedHash: string, newHash: string, expiresAt: Date): Promise<boolean>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
export interface PasswordService {
  verify(hash: string, value: string): Promise<boolean>;
  hash(value: string): Promise<string>;
}
export interface AccessClaims {
  sub: string;
  ver: number;
  typ: 'access';
}
export interface RefreshClaims {
  sub: string;
  sid: string;
  typ: 'refresh';
  jti?: string;
}
export interface TokenService {
  signAccess(claims: AccessClaims): Promise<string>;
  signRefresh(claims: RefreshClaims): Promise<string>;
  verifyAccess(token: string): Promise<AccessClaims>;
  verifyRefresh(token: string): Promise<RefreshClaims>;
}
