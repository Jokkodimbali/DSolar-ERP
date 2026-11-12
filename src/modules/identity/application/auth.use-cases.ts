import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { IdentityUser, PublicIdentity, toPublicIdentity } from '../domain/identity.types';
import {
  PASSWORD_SERVICE,
  PasswordService,
  SESSION_REPOSITORY,
  SessionRepository,
  TOKEN_SERVICE,
  TokenService,
  USER_REPOSITORY,
  UserRepository,
} from './ports';

export interface AuthResult {
  jetonAcces: string;
  jetonRenouvellement: string;
  utilisateur: PublicIdentity;
}
const unauthorized = () => new UnauthorizedException('Identifiants ou session invalides.');
const sessionExpiry = (): Date => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthUseCases {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_SERVICE) private readonly passwords: PasswordService,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
  ) {}

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    if (!user || user.status !== 'ACTIVE' || !(await this.passwords.verify(user.passwordHash, password)))
      throw unauthorized();
    const sid = randomBytes(16).toString('hex');
    // Le refresh est signé avec l'identifiant de session créé en base.
    const expiry = sessionExpiry();
    const session = await this.sessions.create(user.id, sid, expiry);
    return this.issueTokens(user, session.id, sid);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let claims;
    try {
      claims = await this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw unauthorized();
    }
    if (claims.typ !== 'refresh') throw unauthorized();
    const session = await this.sessions.findById(claims.sid);
    const user = await this.users.findById(claims.sub);
    if (
      !session ||
      !user ||
      user.status !== 'ACTIVE' ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw unauthorized();
    const oldHash = Buffer.from(session.tokenHash, 'hex');
    const incomingHash = Buffer.from(hashToken(refreshToken), 'hex');
    if (oldHash.length !== incomingHash.length || !timingSafeEqual(oldHash, incomingHash)) {
      await this.sessions.revokeAllForUser(user.id);
      throw unauthorized();
    }
    const nextRefresh = await this.tokens.signRefresh({
      sub: user.id,
      sid: session.id,
      typ: 'refresh',
      jti: randomBytes(16).toString('hex'),
    });
    // Le JWT signé peut être identique à la seconde près : ajouter un identifiant de jeton côté service.
    const updated = await this.sessions.rotate(
      session.id,
      session.tokenHash,
      hashToken(nextRefresh),
      sessionExpiry(),
    );
    if (!updated) throw unauthorized();
    const access = await this.tokens.signAccess({ sub: user.id, ver: user.tokenVersion, typ: 'access' });
    return { jetonAcces: access, jetonRenouvellement: nextRefresh, utilisateur: toPublicIdentity(user) };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    try {
      const claims = await this.tokens.verifyRefresh(refreshToken);
      await this.sessions.revoke(claims.sid);
    } catch {
      /* Déconnexion idempotente. */
    }
    return { message: 'Déconnexion effectuée.' };
  }

  async me(id: string): Promise<PublicIdentity> {
    const user = await this.users.findById(id);
    if (!user || user.status !== 'ACTIVE') throw unauthorized();
    return toPublicIdentity(user);
  }

  private async issueTokens(
    user: IdentityUser,
    sessionId: string,
    sessionSecret: string,
  ): Promise<AuthResult> {
    const access = await this.tokens.signAccess({ sub: user.id, ver: user.tokenVersion, typ: 'access' });
    const refresh = await this.tokens.signRefresh({
      sub: user.id,
      sid: sessionId,
      typ: 'refresh',
      jti: randomBytes(16).toString('hex'),
    });
    const updated = await this.sessions.rotate(sessionId, sessionSecret, hashToken(refresh), sessionExpiry());
    if (!updated) throw unauthorized();
    return { jetonAcces: access, jetonRenouvellement: refresh, utilisateur: toPublicIdentity(user) };
  }
}
