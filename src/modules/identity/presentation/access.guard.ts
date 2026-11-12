import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import { TOKEN_SERVICE, TokenService, USER_REPOSITORY, UserRepository } from '../application/ports';
import { AuthenticatedRequest } from './current-user.decorator';

export const REQUIRED_PERMISSIONS = 'required_permissions';
export const RequirePermissions = (...permissions: string[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Authentification requise.');
    let claims;
    try { claims = await this.tokens.verifyAccess(header.slice(7)); }
    catch { throw new UnauthorizedException('Jeton expiré ou invalide.'); }
    const user = await this.users.findById(claims.sub);
    if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== claims.ver) throw new UnauthorizedException('Compte ou session invalide.');
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) ?? [];
    if (!required.every(p => user.permissions.includes(p))) {
      throw new ForbiddenException('Accès non autorisé.');
    }
    request.identity = { id: user.id };
    return true;
  }
}
