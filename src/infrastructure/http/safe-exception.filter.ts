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
      super.catch(exception, host);
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
