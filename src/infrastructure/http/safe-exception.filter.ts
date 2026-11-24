import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';

@Catch()
export class SafeExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);
  constructor(private readonly adapter: HttpAdapterHost) {
    super(adapter.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (exception instanceof HttpException && exception.getStatus() < 500) {
      const status = exception.getStatus();
      const body: unknown = exception.getResponse();
      const raw = typeof body === 'string' ? body :
        body && typeof body === 'object' && 'message' in body ? body.message : undefined;
      const defaults: Record<number, string> = {
        400: 'Requête invalide. Vérifiez les données transmises.',
        401: 'Authentification requise ou session expirée.',
        403: 'Accès non autorisé.',
        404: 'Ressource introuvable.',
        405: 'Méthode HTTP non autorisée.',
        409: 'Conflit de données.',
        413: 'Le fichier ou la requête dépasse la taille autorisée.',
        415: 'Format de fichier ou type de contenu non pris en charge.',
        422: 'Données impossibles à traiter.',
        429: 'Trop de requêtes. Réessayez ultérieurement.',
      };
      const translate = (message: string): string => {
        if (/^Validation failed \(uuid is expected\)/i.test(message)) return 'Identifiant invalide : un UUID est attendu.';
        if (/^Validation failed \(numeric string is expected\)/i.test(message)) return 'Un nombre valide est attendu.';
        if (/^(Cannot (GET|POST|PUT|PATCH|DELETE)|Not Found|Bad Request|Unauthorized|Forbidden|Conflict|Payload Too Large|Unsupported Media Type|Unexpected field|File too large|Unexpected end of form|Multipart:|Unexpected token)/i.test(message))
          return defaults[status] ?? 'Requête refusée.';
        return message;
      };
      const message = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string').map(translate)
        : typeof raw === 'string' ? translate(raw) : defaults[status] ?? 'Requête refusée.';
      if (this.adapter.httpAdapter.isHeadersSent(response)) this.adapter.httpAdapter.end(response);
      else this.adapter.httpAdapter.reply(response, { statusCode: status, message }, status);
      return;
    }
    const conflict =
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2034'].includes(exception.code);
    const status = conflict
      ? HttpStatus.CONFLICT
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    if (!conflict) this.logger.error('Erreur technique HTTP : ' + status);
    if (this.adapter.httpAdapter.isHeadersSent(response)) {
      this.adapter.httpAdapter.end(response);
      return;
    }
    this.adapter.httpAdapter.reply(
      response,
      {
        statusCode: status,
        message: conflict ? 'Conflit de données ou opération concurrente.' : 'Erreur technique du serveur.',
      },
      status,
    );
  }
}
