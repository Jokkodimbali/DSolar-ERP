import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Observable, timer, exhaustMap, map, distinctUntilChanged, takeUntil, catchError, EMPTY } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, SESSION_REPOSITORY, TokenService, UserRepository, SessionRepository } from '../../identity/application/ports';
import { NOTIFICATIONS, NotificationQuery, NotificationsPort } from './notifications.port';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATIONS) private readonly repository: NotificationsPort,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
  ) {}

  feed(actorId: string, query?: NotificationQuery) { return this.repository.feed(actorId, query); }

  async mark(actorId: string, id?: string) {
    const marked = await this.repository.mark(actorId, id);
    return { marked, message: id ? 'Notification marquée comme lue.' : 'Toutes les notifications accessibles sont marquées comme lues.' };
  }

  stream(actorId: string, authorization: string): Observable<MessageEvent> {
    return timer(0, 5000).pipe(
      exhaustMap(async () => {
        const claims = await this.tokens.verifyAccess(authorization.slice(7));
        const [user, session] = await Promise.all([this.users.findById(actorId), this.sessions.findById(claims.sid)]);
        if (claims.sub !== actorId || !user || user.status !== 'ACTIVE' || user.tokenVersion !== claims.ver ||
            !session || session.userId !== actorId || session.revokedAt || session.expiresAt <= new Date())
          throw new UnauthorizedException('Session invalide.');
        return this.repository.feed(actorId);
      }),
      map((feed) => JSON.stringify(feed)),
      distinctUntilChanged(),
      map((data): MessageEvent => ({ type: 'notifications', data })),
      takeUntil(timer(60000)),
      catchError(() => EMPTY),
    );
  }
}
